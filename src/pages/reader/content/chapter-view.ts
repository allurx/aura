/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Chapter from "@/domain/chapter/chapter";
import type { EpubNode } from "@/domain/file/epub-content";
import { getEpubStructureRejection } from "@/domain/file/epub-content";
import OperationError from "@/errors/operation-error";
import { assertExists } from "@/utils/assert-util";
import type { ContentLocation } from "./content-location";
import { readContentSelection, restoreContentSelection } from "./content-location";

interface SourceNode {
    readonly id: number;
    readonly node: EpubNode;
    readonly start: number;
    readonly end: number;
    readonly children: readonly SourceNode[];
    readonly nodeCount: number;
    readonly direction?: "ltr" | "rtl";
    readonly inlineImage?: boolean;
}

interface ChapterPiece {
    readonly blockNumber: number;
    readonly start: number;
    readonly end: number;
    readonly source: string | SourceNode;
    readonly length: number;
    readonly nodeCount: number;
}

/**
 * 已显示窗口的临时源页界；后台索引沿用仍影响可见内容的边界，窗口回收后不累计保留。
 */
export interface ChapterSeam {
    readonly location: ContentLocation;
    readonly carry: number;
    readonly inlineCarry: number;
}

const PIECE_TEXT_LIMIT = 6_000;
const PIECE_NODE_LIMIT = 96;
const blockTags = new Set([
    "article",
    "aside",
    "blockquote",
    "dd",
    "div",
    "dl",
    "dt",
    "figure",
    "figcaption",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "ol",
    "p",
    "section",
    "ul",
]);
const textFlowTags = new Set([...blockTags, "caption", "pre", "table", "td", "th"]);

/**
 * 一章的源内容、可独立排版的片段和图片 URL；实际正文只挂载阅读窗口。
 * 片段沿用源块与 UTF-16 偏移，不改变章节或持久化进度的身份。
 */
export default class ChapterView {
    public readonly element = document.createElement("section");
    private readonly urls = new Map<string, string>();
    private readonly preparingImages = new Map<string, number>();
    private readonly imageSizes = new Map<string, { width: number; height: number }>();
    private readonly images: { location: ContentLocation; path: string }[] = [];
    private readonly lifetime = new AbortController();
    private readonly projections = new Set<HTMLElement>();
    private readonly sourceAnchors = new Map<string, ContentLocation>();
    private readonly pieces: ChapterPiece[] = [];

    /**
     * 资源索引由书籍共享，视图只保留当前章节实际引用的 URL。
     */
    private constructor(
        public readonly chapter: Chapter,
        private readonly resources: ReadonlyMap<string, Blob> | undefined
    ) {
        this.configureSection(this.element);
    }

    /**
     * 只准备源片段；目标窗口确定后再读取其图片尺寸，不提前挂载无关的章首内容。
     */
    public static async create(
        chapter: Chapter,
        resources: ReadonlyMap<string, Blob> | undefined,
        signal: AbortSignal
    ): Promise<ChapterView> {
        const view = new ChapterView(chapter, resources);
        const cancel = (): void => {
            view.dispose();
        };
        signal.addEventListener("abort", cancel, { once: true });
        try {
            await view.prepare(signal);
            if (!signal.aborted && view.pieceCount === 0) view.mountRange(0, 0);
            return view;
        } catch (error) {
            view.dispose();
            throw error;
        } finally {
            signal.removeEventListener("abort", cancel);
        }
    }

    /**
     * 呈现片段数只约束布局工作量，不作为内容块总数或阅读进度。
     */
    public get pieceCount(): number {
        return this.pieces.length;
    }

    /**
     * 同时按片段数和文本量选择布局预算，避免很多长片段重新形成整章量级的任务。
     */
    public rangeEnd(start: number, maximumPieces = 32): number {
        let end = start;
        let textLength = 0;
        let nodeCount = 0;
        while (end < this.pieces.length && end - start < maximumPieces) {
            const piece = this.pieces[end];
            if (!piece) break;
            const nextLength = textLength + piece.end - piece.start;
            const nextNodes = nodeCount + piece.nodeCount;
            if (end > start && (nextLength > 16_000 || nextNodes > 160)) break;
            textLength = nextLength;
            nodeCount = nextNodes;
            end++;
        }
        return end;
    }

    /**
     * 挂载或测量前只准备目标范围内的图片；尺寸仅在本章节会话内复用。
     * 成功后返回释放函数，调用方在挂载或取消后释放准备引用；undefined 表示已经取消。
     */
    public async prepareRange(start: number, end: number, signal: AbortSignal): Promise<(() => void) | undefined> {
        const lifetime = AbortSignal.any([signal, this.lifetime.signal]);
        if (lifetime.aborted) return undefined;
        const paths = this.imagePaths(start, end);
        for (const path of paths) this.preparingImages.set(path, (this.preparingImages.get(path) ?? 0) + 1);
        let released = false;
        const release = (): void => {
            if (released) return;
            released = true;
            for (const path of paths) {
                const remaining = (this.preparingImages.get(path) ?? 0) - 1;
                if (remaining > 0) this.preparingImages.set(path, remaining);
                else this.preparingImages.delete(path);
            }
            this.releaseUnusedResources();
        };
        try {
            for (const path of paths) {
                if (this.imageSizes.has(path)) continue;
                const size = await readImageSize(this.imageUrl(path), path, lifetime);
                if (!size || !isActive(lifetime)) {
                    release();
                    return undefined;
                }
                this.imageSizes.set(path, size);
            }
            if (!isActive(lifetime)) {
                release();
                return undefined;
            }
            return release;
        } catch (error) {
            release();
            throw error;
        }
    }

    /**
     * 同步重排只能使用尺寸已知的范围，不能先提交未知图片再等待它改变页界。
     */
    public isRangeReady(start: number, end: number): boolean {
        return this.imagePaths(start, end).every((path) => this.imageSizes.has(path));
    }

    /**
     * 图片位置按源顺序排列，只查目标片段的引用，不为每次窗口更新重扫全章结构。
     */
    private imagePaths(start: number, end: number): string[] {
        const first = this.pieces[start];
        const last = this.pieces[end - 1];
        if (!first || !last || start >= end) return [];
        const from = { blockNumber: first.blockNumber, contentOffset: first.start };
        const to = { blockNumber: last.blockNumber, contentOffset: last.end };
        let low = 0;
        let high = this.images.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            const image = this.images[middle];
            if (image && compareLocation(image.location, from) < 0) low = middle + 1;
            else high = middle;
        }
        const paths = new Set<string>();
        for (let index = low; index < this.images.length; index++) {
            const image = this.images[index];
            if (!image || compareLocation(image.location, to) >= 0) break;
            paths.add(image.path);
        }
        return [...paths];
    }

    /**
     * 根据稳定源位置找到对应片段；边界位置归属于后一个片段。
     */
    public pieceIndex(location: ContentLocation): number {
        let low = 0;
        let high = this.pieces.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            const piece = this.pieces[middle];
            if (
                piece &&
                (piece.blockNumber < location.blockNumber ||
                    (piece.blockNumber === location.blockNumber &&
                        piece.end <= location.contentOffset &&
                        piece.end > piece.start))
            ) {
                low = middle + 1;
            } else high = middle;
        }
        return Math.min(low, Math.max(0, this.pieces.length - 1));
    }

    /**
     * 片段起点可用于未完成全章索引时的立即呈现。
     */
    public pieceLocation(index: number): ContentLocation {
        const piece = assertExists(this.pieces[index], "Missing chapter source piece");
        return { blockNumber: piece.blockNumber, contentOffset: piece.start };
    }

    /**
     * 批次末尾仍引用最后一个源位置，空块保留零偏移。
     */
    public pieceEndLocation(index: number): ContentLocation {
        const piece = assertExists(this.pieces[index], "Missing chapter source piece");
        return { blockNumber: piece.blockNumber, contentOffset: Math.max(piece.start, piece.end - 1) };
    }

    /**
     * 只有从原段落内部开始的片段需要续接首行，不把新段落变成上一段的继续。
     */
    public continuesText(index: number, offset = this.pieces[index]?.start ?? 0): boolean {
        const piece = this.pieces[index];
        if (!piece || offset === 0) return false;
        if (typeof piece.source === "string") return true;
        let flowStart = piece.source.start;
        let source: SourceNode | undefined = piece.source;
        while (source) {
            if (source.node.type === "element" && blockTags.has(source.node.tag)) flowStart = source.start;
            source = source.children.find((child) => child.start <= offset && child.end > offset);
        }
        return offset > flowStart;
    }

    /**
     * 原书锚点可在未挂载时转换为源位置，不依赖选择器或全章 DOM。
     */
    public anchorLocation(id: string): ContentLocation | undefined {
        return this.sourceAnchors.get(id);
    }

    /**
     * 创建独立的受控片段供测量或翻页预览使用，不替换正在阅读的正文。
     * carry 只表示上一批末页已用的排版高度，不进入源内容或阅读进度。
     */
    public renderRange(
        start: number,
        end: number,
        carry = 0,
        inlineCarry = 0,
        seams: readonly ChapterSeam[] = []
    ): HTMLElement {
        const section = document.createElement("section");
        this.configureSection(section);
        this.fillWindow(section, start, end, carry, inlineCarry, seams);
        return section;
    }

    /**
     * 仅用于对齐临时页首，从精确源位置开始准备同一受控结构。
     * 页内窗口起点保留原边距；真实新页首沿用原生分栏丢弃起始外边距的行为。
     */
    public renderFrom(location: ContentLocation, end: number, pageStart = true): HTMLElement {
        const section = document.createElement("section");
        this.configureSection(section);
        this.fillRange(section, this.pieceIndex(location), end, 0, 0, location, undefined, pageStart);
        return section;
    }

    /**
     * 临时投影持有当前片段的图片，替换后回收不再被正文或其他投影引用的 URL。
     */
    public mountProjection(viewport: HTMLElement, section: HTMLElement): void {
        this.projections.add(viewport);
        viewport.replaceChildren(section);
        this.releaseUnusedResources();
    }

    /**
     * 已复制的当前纸面保留其图片引用，不重新挂载并打断副本内部的滚动位置。
     */
    public retainProjection(viewport: HTMLElement): void {
        this.projections.add(viewport);
    }

    /**
     * 预览沿用仍在当前窗口中的表格与代码滚动位置，与正式挂载复用同一源节点的结果一致。
     */
    public restoreProjectionScroll(section: HTMLElement): void {
        const regions = new Map<string, HTMLElement>();
        for (const region of this.element.querySelectorAll<HTMLElement>("table, pre")) {
            const key = renderedKey(region);
            if (key) regions.set(key, region);
        }
        for (const region of section.querySelectorAll<HTMLElement>("table, pre")) {
            const key = renderedKey(region);
            const original = key ? regions.get(key) : undefined;
            if (!original) continue;
            region.scrollTop = original.scrollTop;
            region.scrollLeft = original.scrollLeft;
        }
    }

    /**
     * 测量或预览结束后释放图片引用；当前可见正文使用的 URL 继续保留。
     */
    public releaseProjection(viewport: HTMLElement): void {
        this.projections.delete(viewport);
        viewport.replaceChildren();
        this.releaseUnusedResources();
    }

    /**
     * 表格、预格式文本与注音整体跨窗口，临时页界不能截断这些原生单元。
     */
    public safeBoundary(location: ContentLocation): ContentLocation {
        const piece = this.pieces[this.pieceIndex(location)];
        if (!piece || typeof piece.source === "string") return location;
        let source: SourceNode | undefined = piece.source;
        while (source) {
            if (source.node.type === "element" && ["table", "pre", "ruby"].includes(source.node.tag))
                return { blockNumber: piece.blockNumber, contentOffset: source.start };
            source = source.children.find(
                (child) => child.start <= location.contentOffset && child.end > location.contentOffset
            );
        }
        return location;
    }

    /**
     * 只保留当前源窗口内部的临时页界，不将已离开的阅读历史累积为布局状态。
     */
    public seamsInRange(start: number, end: number, seams: readonly ChapterSeam[]): ChapterSeam[] {
        const first = this.pieces[start];
        const last = this.pieces[end - 1];
        return first && last
            ? seams
                  .filter(
                      ({ location }) =>
                          compareLocation(location, { blockNumber: first.blockNumber, contentOffset: first.start }) >
                              0 &&
                          compareLocation(location, { blockNumber: last.blockNumber, contentOffset: last.end }) < 0
                  )
                  .toSorted((a, b) => compareLocation(a.location, b.location))
            : [];
    }

    /**
     * 在稳定章节根上替换有界窗口，保留外部观察与章节引用。
     */
    public mountRange(
        start: number,
        end: number,
        carry = 0,
        inlineCarry = 0,
        seams: readonly ChapterSeam[] = []
    ): void {
        const selection = document.getSelection();
        const selected = readContentSelection(this.element, selection);
        const prepared = document.createElement("section");
        this.fillWindow(prepared, start, end, carry, inlineCarry, seams);
        const oldNodes = renderedNodes(this.element);
        const desiredNodes = renderedNodes(prepared);
        const desired = [...prepared.children];
        const installed: Element[] = [];

        // 新祖先先接入页面，旧子树随后在两个已连接的父节点间移动，避免丢失滚动与原生交互状态。
        for (const [index, candidate] of desired.entries()) {
            const key = renderedKey(candidate);
            const element = key ? (oldNodes.get(key) ?? candidate) : candidate;
            const reference = this.element.children[index] ?? null;
            if (element !== reference) moveElement(this.element, element, reference);
            installed.push(element);
            if (element !== candidate) continue;
            for (const descendant of [...element.querySelectorAll<HTMLElement>("[data-source-key]")]) {
                if (!this.element.contains(descendant)) continue;
                const sourceKey = renderedKey(descendant);
                const previous = sourceKey ? oldNodes.get(sourceKey) : undefined;
                if (previous && previous !== descendant && descendant.parentElement) {
                    moveElement(descendant.parentElement, previous, descendant);
                    descendant.remove();
                }
            }
        }
        for (const child of [...this.element.children]) {
            if (!installed.includes(child)) child.remove();
        }

        // 字体继承自动更新；这里只同步续排使用的局部样式，保留相同节点的文本和内部滚动。
        const mountedNodes = renderedNodes(this.element);
        for (const [key, element] of mountedNodes) {
            const desiredElement = desiredNodes.get(key);
            if (desiredElement && element.style.cssText !== desiredElement.style.cssText)
                element.style.cssText = desiredElement.style.cssText;
        }
        // 新页界可能拆开原 Text；按源边界恢复，不复用旧 DOM 的子节点索引。
        if (selection && selected) restoreContentSelection(this.element, selection, selected);
        this.releaseUnusedResources();
    }

    /**
     * 释放章节创建的图片 URL；准备失败、取消与移出窗口均可重复调用。
     */
    public dispose(): void {
        this.lifetime.abort();
        for (const url of this.urls.values()) URL.revokeObjectURL(url);
        this.urls.clear();
        this.preparingImages.clear();
        this.imageSizes.clear();
        this.projections.clear();
        this.sourceAnchors.clear();
    }

    /**
     * 引用由实际挂载的有限正文与测量片段决定，后台索引不会累计整章图片 URL。
     */
    private releaseUnusedResources(): void {
        const retained = new Set<string>();
        for (const root of [this.element, ...this.projections]) {
            for (const image of root.querySelectorAll<HTMLImageElement>("img")) retained.add(image.src);
        }
        for (const [path, url] of this.urls) {
            if (retained.has(url) || this.preparingImages.has(path)) continue;
            URL.revokeObjectURL(url);
            this.urls.delete(path);
        }
    }

    /**
     * 尺寸准备与随后呈现共用 URL，避免同一图片在两个资源身份下重复加载。
     */
    private imageUrl(path: string): string {
        let url = this.urls.get(path);
        if (!url) {
            url = URL.createObjectURL(assertExists(this.resources?.get(path), "Missing EPUB image: " + path));
            this.urls.set(path, url);
        }
        return url;
    }

    /**
     * 真实正文和测量正文使用相同的章节语义与样式入口。
     */
    private configureSection(section: HTMLElement): void {
        section.className = "reading-chapter";
        section.dataset["chapterNumber"] = String(this.chapter.chapterNumber);
        section.setAttribute("aria-label", this.chapter.title);
    }

    /**
     * 源模型按块准备并定期让出主线程；图片仅在其片段进入正文或测量窗口时创建 URL。
     */
    private async prepare(signal: AbortSignal): Promise<void> {
        if (this.chapter.kind === "text") {
            for (const [index, line] of this.chapter.lines.entries()) {
                this.addPieces(index + 1, line, line.length, textBreaks(line));
                if (index % 128 === 127) await yieldTask(signal);
                if (signal.aborted) return;
            }
        } else {
            if (!this.resources) throw new Error("Content format does not match the opened book");
            const rejection = getEpubStructureRejection(this.chapter.blocks);
            if (rejection)
                throw new OperationError(
                    "这本书的内容超出支持范围",
                    "连续空结构过多，无法安全排版。原文件仍保留。",
                    new Error(rejection),
                    "请返回书架导出原文件，尝试用其他阅读器打开。"
                );
            for (const id of this.chapter.startAnchors ?? [])
                this.sourceAnchors.set(id, { blockNumber: 1, contentOffset: 0 });
            for (const [index, node] of this.chapter.blocks.entries()) {
                const boundaries: number[] = [];
                const hardBreaks: number[] = [];
                const atomicRanges: { start: number; end: number }[] = [];
                let offset = 0;
                let nodes = 0;
                let checkpointNodes = 0;
                const visit = (current: EpubNode, inlineImage = false): SourceNode => {
                    const start = offset;
                    const startNodes = nodes;
                    if (current.type !== "text" && current.id && !this.sourceAnchors.has(current.id)) {
                        this.sourceAnchors.set(current.id, { blockNumber: index + 1, contentOffset: offset });
                    }
                    nodes++;
                    const children: SourceNode[] = [];
                    if (current.type === "text") {
                        for (const boundary of textBreaks(current.text)) boundaries.push(offset + boundary);
                        offset += current.text.length;
                    } else if (current.type === "image") {
                        this.images.push({
                            location: { blockNumber: index + 1, contentOffset: offset },
                            path: current.path,
                        });
                        offset++;
                    } else if (current.tag === "br" || current.tag === "hr") offset++;
                    else {
                        // 图片是否与文字混排取决于完整源文本流，不能随当前分页裁掉相邻文字而变化。
                        const inlineImages =
                            current === node || textFlowTags.has(current.tag)
                                ? hasInlineText(current.children)
                                : inlineImage;
                        for (const child of current.children) children.push(visit(child, inlineImages));
                        if (blockTags.has(current.tag) || nodes >= PIECE_NODE_LIMIT) {
                            boundaries.push(offset);
                        }
                    }
                    if (current.type === "element" && ["table", "pre", "ruby"].includes(current.tag)) {
                        atomicRanges.push({ start, end: offset });
                    }
                    if (nodes - checkpointNodes >= PIECE_NODE_LIMIT) {
                        hardBreaks.push(offset);
                        checkpointNodes = nodes;
                    }
                    return {
                        id: startNodes,
                        ...(current.type === "element" &&
                        (current.dir === "auto" || (current.tag === "bdi" && current.dir === undefined))
                            ? sourceDirection(current)
                            : {}),
                        ...(current.type === "image" && inlineImage ? { inlineImage: true } : {}),
                        node: current,
                        start,
                        end: offset,
                        children,
                        nodeCount: nodes - startNodes,
                    };
                };
                const source = visit(node);
                const outsideAtomic = (boundary: number): boolean =>
                    !atomicRanges.some((range) => boundary > range.start && boundary < range.end);
                this.addPieces(
                    index + 1,
                    source,
                    offset,
                    boundaries.filter(outsideAtomic),
                    hardBreaks.filter(outsideAtomic)
                );
                if (index % 64 === 63) await yieldTask(signal);
                if (signal.aborted) return;
            }
        }
    }

    /**
     * 优先在源结构边界分片；特别长的单个文本节点也保持有界，不回退为整章挂载。
     */
    private addPieces(
        blockNumber: number,
        source: string | SourceNode,
        length: number,
        breaks: number[],
        hardBreaks: number[] = []
    ): void {
        const hard = new Set(hardBreaks);
        const boundaries = [...new Set([...breaks, ...hardBreaks, length])].sort((a, b) => a - b);
        let start = 0;
        let end = 0;
        for (const boundary of boundaries) {
            if (boundary - start > PIECE_TEXT_LIMIT && end > start) {
                this.pieces.push({
                    blockNumber,
                    start,
                    end,
                    source,
                    length,
                    nodeCount: typeof source === "string" ? 2 : countSourceNodes(source, start, end, end === length),
                });
                start = end;
            }
            end = boundary;
            if (hard.has(boundary) && end > start) {
                this.pieces.push({
                    blockNumber,
                    start,
                    end,
                    source,
                    length,
                    nodeCount: typeof source === "string" ? 2 : countSourceNodes(source, start, end, end === length),
                });
                start = end;
            }
        }
        if (end > start || length === 0)
            this.pieces.push({
                blockNumber,
                start,
                end,
                source,
                length,
                nodeCount: typeof source === "string" ? 2 : countSourceNodes(source, start, end, end === length),
            });
    }

    /**
     * 所有片段保留源块号与起始偏移；空白续排节点不能成为阅读位置。
     */
    private fillWindow(
        section: HTMLElement,
        start: number,
        end: number,
        carry: number,
        inlineCarry: number,
        seams: readonly ChapterSeam[]
    ): void {
        const boundaries = this.seamsInRange(start, end, seams);
        if (boundaries.length === 0) {
            this.fillRange(section, start, end, carry, inlineCarry);
            return;
        }
        const result = document.createDocumentFragment();
        let lower: ContentLocation | undefined;
        for (let index = 0; index <= boundaries.length; index++) {
            const boundary = boundaries[index];
            const previous = boundaries[index - 1];
            const segment = document.createElement("section");
            this.fillRange(
                segment,
                start,
                end,
                previous ? 0 : carry,
                previous?.inlineCarry ?? inlineCarry,
                lower,
                boundary?.location,
                previous !== undefined
            );
            if (previous) {
                const separator = document.createElement("div");
                separator.className = "reading-carry";
                separator.setAttribute("aria-hidden", "true");
                separator.style.breakBefore = "column";
                // 非空载体确保断页生效；首段起始边距由 fillRange 按原生列首语义去除。
                separator.style.height = `${Math.max(0, previous.carry) + 1}px`;
                separator.style.marginBottom = `${Math.min(0, previous.carry) - 1}px`;
                result.append(separator);
            }
            result.append(...segment.childNodes);
            lower = boundary?.location;
        }
        section.replaceChildren(result);
    }

    /**
     * 所有片段保留源块号与起始偏移；空白续排节点不能成为阅读位置。
     */
    private fillRange(
        section: HTMLElement,
        start: number,
        end: number,
        carry: number,
        inlineCarry: number,
        lower?: ContentLocation,
        upper?: ContentLocation,
        pageStart = false
    ): void {
        const fragment = document.createDocumentFragment();
        if (carry !== 0) {
            const spacer = document.createElement("div");
            spacer.className = "reading-carry";
            spacer.setAttribute("aria-hidden", "true");
            spacer.style.height = String(Math.max(0, carry)) + "px";
            if (carry < 0) spacer.style.marginBottom = String(carry) + "px";
            fragment.append(spacer);
        }
        if (start === 0 && !lower && this.chapter.kind === "text") {
            const heading = document.createElement("h2");
            heading.className = "chapter-heading";
            heading.textContent = this.chapter.title;
            fragment.append(heading);
        }
        let firstRendered = true;
        for (let index = start; index < Math.min(end, this.pieces.length); index++) {
            const piece = this.pieces[index];
            if (!piece) continue;
            const firstIndex = index;
            let last = piece;
            // 工作片段不是段落：相邻同源片段合并回原结构，不制造换行或重复列表项。
            while (index + 1 < end) {
                const next = this.pieces[index + 1];
                if (next?.blockNumber !== piece.blockNumber) break;
                last = next;
                index++;
            }
            if ((lower && piece.blockNumber < lower.blockNumber) || (upper && piece.blockNumber > upper.blockNumber))
                continue;
            const contentStart =
                lower?.blockNumber === piece.blockNumber ? Math.max(piece.start, lower.contentOffset) : piece.start;
            const contentEnd =
                upper?.blockNumber === piece.blockNumber ? Math.min(last.end, upper.contentOffset) : last.end;
            if (contentEnd < contentStart || (contentEnd === contentStart && piece.length > 0)) continue;
            const block = document.createElement(typeof piece.source === "string" ? "p" : "div");
            block.dataset["blockNumber"] = String(piece.blockNumber);
            block.dataset["contentOffset"] = String(contentStart);
            block.dataset["contentEnd"] = String(contentEnd);
            block.dataset["pieceIndex"] = String(firstIndex);
            block.dataset["pieceEnd"] = String(index + 1);
            if (contentStart > 0) block.dataset["continuation"] = "";
            if (typeof piece.source === "string") block.textContent = piece.source.slice(contentStart, contentEnd);
            else {
                block.className = "epub-block";
                const node = this.createEpubSlice(
                    piece.source,
                    contentStart,
                    contentEnd,
                    firstRendered && pageStart,
                    contentEnd === piece.length
                );
                if (node) block.append(node);
            }
            // 批次边缘不等于章末，必须保留真实段落间距；块内续片没有额外段落间距。
            if (contentEnd < piece.length) block.style.marginBottom = "0";
            else if (index < this.pieces.length - 1) block.style.marginBottom = "var(--reader-paragraph-spacing)";
            if (firstRendered && this.continuesText(firstIndex, contentStart)) {
                const text = document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode();
                const flow =
                    text?.parentElement?.closest<HTMLElement>("p, li, h1, h2, h3, h4, h5, h6, pre, div") ?? block;
                flow.style.textIndent = String(inlineCarry) + "px";
                // 源段落已在之前的页面开始，第一段残余行不是新的孤行约束起点。
                flow.style.orphans = "1";
            }
            fragment.append(block);
            firstRendered = false;
        }
        section.replaceChildren(fragment);
    }

    /**
     * 索引直接跳过范围外子树，只克隆源范围及其必要祖先；不挂载原书 DOM。
     * 接缝处的零长度兄弟归属后续片段；已完整结束的祖先保留自己的尾部空结构。
     */
    private createEpubSlice(
        source: SourceNode,
        start: number,
        end: number,
        pageStart: boolean,
        includeEnd: boolean
    ): Node | undefined {
        if (!intersectsSourceRange(source, start, end, includeEnd)) return undefined;
        const node = source.node;
        if (node.type === "text") {
            return document.createTextNode(
                node.text.slice(Math.max(0, start - source.start), Math.min(node.text.length, end - source.start))
            );
        }
        let element: HTMLElement;
        if (node.type === "image") {
            const size = assertExists(this.imageSizes.get(node.path), "Missing prepared EPUB image: " + node.path);
            const image = document.createElement("img");
            image.src = this.imageUrl(node.path);
            image.alt = node.alt;
            image.width = size.width;
            image.height = size.height;
            if (source.inlineImage) image.className = "epub-inline-image";
            element = image;
        } else {
            element = document.createElement(node.tag);
            const includeTrailing = includeEnd || source.end === end;
            // 源子节点按偏移有序，巨型顶层容器不为每个显示片段重扫全树。
            let low = 0;
            let high = source.children.length;
            while (low < high) {
                const middle = Math.floor((low + high) / 2);
                const child = source.children[middle];
                if (child && child.end < start) low = middle + 1;
                else high = middle;
            }
            for (let index = low; index < source.children.length; index++) {
                const child = source.children[index];
                if (!child || child.start > end || (child.start === end && !includeTrailing)) break;
                const result = this.createEpubSlice(child, start, end, pageStart, includeTrailing);
                if (result) element.append(result);
            }
            if (node.href) {
                element.setAttribute("href", "#");
                element.dataset["bookPath"] = node.href.path;
                element.dataset["bookFragment"] = node.href.fragment ?? "";
            }
            if (node.colSpan !== undefined) element.setAttribute("colspan", String(node.colSpan));
            if (node.rowSpan !== undefined) element.setAttribute("rowspan", String(node.rowSpan));
            // 四个以内源位置可按自然宽度排版；长内容保留最小列宽，避免中文表格挤成逐字竖列。
            if ((node.tag === "td" || node.tag === "th") && source.end - source.start <= 4)
                element.classList.add("epub-compact-cell");
            if (node.start !== undefined) element.setAttribute("start", String(node.start));
            if (node.value !== undefined) element.setAttribute("value", String(node.value));
            if (node.reversed) element.setAttribute("reversed", "");
            if (node.tag === "q") {
                // 引号属于完整引语的首尾，续片只维持原生嵌套层级，不重复生成引号。
                if (source.start < start) element.dataset["quoteContinuation"] = "";
                if (source.end > end) element.dataset["quoteContinues"] = "";
            }
            if (blockTags.has(node.tag) || node.tag === "pre") {
                // 只处理新页首沿源边界展开的祖先链，不改变后续段落的正常间距。
                if (source.start < start || (pageStart && source.start === start)) element.style.marginBlockStart = "0";
                if (source.end > end) element.style.marginBlockEnd = "0";
                if (node.tag === "li" && source.start < start) element.style.listStyleType = "none";
            }
        }
        const direction = source.direction ?? node.dir;
        if (direction !== undefined) element.dir = direction;
        if (node.lang !== undefined) element.lang = node.lang;
        element.dataset["sourceKey"] = String(source.id);
        element.dataset["sourceStart"] = String(Math.max(start, source.start));
        element.dataset["sourceEnd"] = String(Math.min(end, source.end));
        return element;
    }
}

/**
 * 按块号和块内偏移比较源位置，不使用临时页码或屏幕坐标。
 */
function compareLocation(a: ContentLocation, b: ContentLocation): number {
    return a.blockNumber - b.blockNumber || a.contentOffset - b.contentOffset;
}

/**
 * 同一源节点与实际片段范围才可复用，不能用位置相同的不同祖先互换。
 */
function renderedKey(element: Element): string | undefined {
    if (!(element instanceof HTMLElement)) return undefined;
    const block = element.closest<HTMLElement>("[data-block-number]");
    if (!block) return undefined;
    const blockNumber = block.dataset["blockNumber"] ?? "";
    return element === block
        ? [blockNumber, "block", block.dataset["contentOffset"], block.dataset["contentEnd"]].join(":")
        : [
              blockNumber,
              element.dataset["sourceKey"],
              element.dataset["sourceStart"],
              element.dataset["sourceEnd"],
          ].join(":");
}

/**
 * 取消立即结束尺寸读取，迟到的解码结果不进入章节状态；URL 由调用方管理。
 */
async function readImageSize(
    url: string,
    path: string,
    signal: AbortSignal
): Promise<{ width: number; height: number } | undefined> {
    if (signal.aborted) return undefined;
    const image = new Image();
    let cancel: (() => void) | undefined;
    try {
        return await new Promise((resolve, reject) => {
            cancel = () => {
                resolve(undefined);
            };
            signal.addEventListener("abort", cancel, { once: true });
            image.src = url;
            void image.decode().then(
                () => {
                    if (signal.aborted) resolve(undefined);
                    else if (image.naturalWidth > 0 && image.naturalHeight > 0)
                        resolve({ width: image.naturalWidth, height: image.naturalHeight });
                    else reject(new Error("EPUB image has no intrinsic size: " + path));
                },
                (error: unknown) => {
                    if (signal.aborted) resolve(undefined);
                    else reject(new Error("Unable to decode EPUB image: " + path, { cause: error }));
                }
            );
            if (signal.aborted) cancel();
        });
    } finally {
        if (cancel) signal.removeEventListener("abort", cancel);
        image.removeAttribute("src");
    }
}

/**
 * 仅索引当前有界窗口，复用完成后即可回收，不持有全章 DOM 缓存。
 */
function renderedNodes(section: HTMLElement): Map<string, HTMLElement> {
    const result = new Map<string, HTMLElement>();
    for (const element of section.querySelectorAll<HTMLElement>("[data-block-number], [data-source-key]")) {
        const key = renderedKey(element);
        if (key) result.set(key, element);
    }
    return result;
}

/**
 * 支持原子移动时保留焦点和选择；旧环境沿用原生插入，由页面保护正在操作的窗口。
 */
function moveElement(parent: HTMLElement, element: Element, reference: Element | null): void {
    if (typeof parent.moveBefore === "function" && parent.isConnected && element.isConnected) {
        parent.moveBefore(element, reference);
    } else parent.insertBefore(element, reference);
}

/**
 * 按索引统计将要克隆的节点预算，完全包含的子树不再逐节点遍历。
 */
function countSourceNodes(source: SourceNode, start: number, end: number, includeEnd: boolean): number {
    if (!intersectsSourceRange(source, start, end, includeEnd)) return 0;
    if (source.start >= start && source.end <= end) return source.nodeCount;
    const includeTrailing = includeEnd || source.end === end;
    let count = 1;
    let low = 0;
    let high = source.children.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const child = source.children[middle];
        if (child && child.end < start) low = middle + 1;
        else high = middle;
    }
    for (let index = low; index < source.children.length; index++) {
        const child = source.children[index];
        if (!child || child.start > end || (child.start === end && !includeTrailing)) break;
        count += countSourceNodes(child, start, end, includeTrailing);
    }
    return count;
}

/**
 * 计数与投影共用源范围归属：零长度节点留在后续片段，完整结束的祖先保留尾部空结构。
 */
function intersectsSourceRange(source: SourceNode, start: number, end: number, includeEnd: boolean): boolean {
    return source.start === source.end
        ? source.start >= start && (source.start < end || (source.start === end && includeEnd))
        : source.end > start && source.start < end;
}

/**
 * 只检查当前文本流中的可见文字；嵌套段落、表格和列表项各自决定图片的行内语义。
 */
function hasInlineText(nodes: readonly EpubNode[]): boolean {
    return nodes.some((node) =>
        node.type === "text"
            ? node.text.trim().length > 0
            : node.type === "element" && !textFlowTags.has(node.tag) && hasInlineText(node.children)
    );
}

/**
 * 自动方向属于完整源节点，不能随着窗口裁掉开头而改变。
 * 两种强字符哨兵区分首强字符和无强字符，由原生 HTML 算法识别 Unicode。
 */
function sourceDirection(node: EpubNode): { readonly direction?: "ltr" | "rtl" } {
    if (node.type !== "element") return {};
    const probe = document.createElement("span");
    probe.dir = "auto";
    const visit = (child: EpubNode): "ltr" | "rtl" | undefined => {
        if (child.type === "text") {
            probe.textContent = child.text + "A";
            if (probe.matches(":dir(rtl)")) return "rtl";
            probe.textContent = child.text + "א";
            return probe.matches(":dir(ltr)") ? "ltr" : undefined;
        }
        if (child.type === "image" || child.dir || child.tag === "bdi") return undefined;
        for (const descendant of child.children) {
            const direction = visit(descendant);
            if (direction) return direction;
        }
        return undefined;
    };
    for (const child of node.children) {
        const direction = visit(child);
        if (direction) return { direction };
    }
    return {};
}

/**
 * 在 UTF-16 安全边界限制单个文本片段，优先使用附近空白或标点，避免截断代理对。
 */
function textBreaks(text: string): number[] {
    const boundaries: number[] = [];
    for (let offset = PIECE_TEXT_LIMIT; offset < text.length; offset += PIECE_TEXT_LIMIT) {
        let boundary = offset;
        for (let index = offset; index > offset - 160; index--) {
            if (/[\s。！？；.!?;]/u.test(text[index] ?? "")) {
                boundary = index + 1;
                break;
            }
        }
        const code = text.charCodeAt(boundary);
        if (code >= 0xdc00 && code <= 0xdfff) boundary--;
        boundaries.push(boundary);
    }
    boundaries.push(text.length);
    return boundaries;
}

/**
 * 异步返回后重新读取生命周期，不沿用 await 前的收窄结果。
 */
function isActive(signal: AbortSignal): boolean {
    return !signal.aborted;
}

/**
 * 源片段准备只让出本次工作，不向页面生命周期之外保留任务。
 */
async function yieldTask(signal: AbortSignal): Promise<void> {
    if (!signal.aborted)
        await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 0);
        });
}
