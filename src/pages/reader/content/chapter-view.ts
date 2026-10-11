/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Chapter from "@/domain/chapter/chapter";
import type { EpubNode } from "@/domain/file/epub-content";
import { assertExists } from "@/utils/assert-util";
import type { ContentLocation } from "./content-location";

interface SourceNode {
    readonly id: number;
    readonly node: EpubNode;
    readonly start: number;
    readonly end: number;
    readonly children: readonly SourceNode[];
    readonly nodeCount: number;
    readonly direction?: "ltr" | "rtl";
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
 * 全章索引尚未到达时保留已显示页的临时源边界；准确索引提交后即可丢弃。
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

/**
 * 一章的源内容、可独立排版的片段和图片 URL；实际正文只挂载阅读窗口。
 * 片段沿用源块与 UTF-16 偏移，不改变章节或持久化进度的身份。
 */
export default class ChapterView {
    public readonly element = document.createElement("section");
    private readonly urls = new Map<string, string>();
    private readonly imageSizes = new Map<string, { width: number; height: number }>();
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
     * 准备源片段及图片尺寸；初始只安装一个有界窗口，后续由排版器选择范围。
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
            if (!signal.aborted) view.mountRange(0, view.rangeEnd(0));
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
     * 创建独立的正文片段供不可交互的测量视窗使用。
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
     */
    public renderFrom(location: ContentLocation, end: number): HTMLElement {
        const section = document.createElement("section");
        this.configureSection(section);
        this.fillRange(section, this.pieceIndex(location), end, 0, 0, location);
        return section;
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
        const selected =
            selection?.rangeCount === 1 &&
            selection.anchorNode &&
            selection.focusNode &&
            this.element.contains(selection.anchorNode) &&
            this.element.contains(selection.focusNode)
                ? {
                      anchor: selection.anchorNode,
                      anchorOffset: selection.anchorOffset,
                      focus: selection.focusNode,
                      focusOffset: selection.focusOffset,
                  }
                : undefined;
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
        // Range 的活端点会随旧祖先移除而折叠；两端源节点仍在窗口中时恢复原方向与精确偏移。
        if (selected && this.element.contains(selected.anchor) && this.element.contains(selected.focus)) {
            if (
                selection?.anchorNode !== selected.anchor ||
                selection.anchorOffset !== selected.anchorOffset ||
                selection.focusNode !== selected.focus ||
                selection.focusOffset !== selected.focusOffset
            ) {
                selection?.setBaseAndExtent(
                    selected.anchor,
                    selected.anchorOffset,
                    selected.focus,
                    selected.focusOffset
                );
            }
        }
    }

    /**
     * 释放章节创建的图片 URL；准备失败、取消与移出窗口均可重复调用。
     */
    public dispose(): void {
        for (const url of this.urls.values()) URL.revokeObjectURL(url);
        this.urls.clear();
        this.imageSizes.clear();
        this.sourceAnchors.clear();
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
     * 源模型按块准备，定期让出主线程；图片先解码，排版期间不再等待尺寸变化。
     */
    private async prepare(signal: AbortSignal): Promise<void> {
        const imagePaths = new Set<string>();
        if (this.chapter.kind === "text") {
            for (const [index, line] of this.chapter.lines.entries()) {
                this.addPieces(index + 1, line, line.length, textBreaks(line));
                if (index % 128 === 127) await yieldTask(signal);
                if (signal.aborted) return;
            }
        } else {
            if (!this.resources) throw new Error("Content format does not match the opened book");
            for (const id of this.chapter.startAnchors ?? [])
                this.sourceAnchors.set(id, { blockNumber: 1, contentOffset: 0 });
            for (const [index, node] of this.chapter.blocks.entries()) {
                const boundaries: number[] = [];
                const hardBreaks: number[] = [];
                const atomicRanges: { start: number; end: number }[] = [];
                let offset = 0;
                let nodes = 0;
                let checkpointNodes = 0;
                const visit = (current: EpubNode): SourceNode => {
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
                        imagePaths.add(current.path);
                        offset++;
                    } else if (current.tag === "br" || current.tag === "hr") offset++;
                    else {
                        for (const child of current.children) children.push(visit(child));
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
                        ...(current.type === "element" && current.dir === "auto" ? sourceDirection(current) : {}),
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
        for (const path of imagePaths) {
            if (signal.aborted) return;
            const url = URL.createObjectURL(assertExists(this.resources?.get(path), "Missing EPUB image: " + path));
            this.urls.set(path, url);
            const image = new Image();
            image.src = url;
            try {
                await image.decode();
            } catch (error) {
                if (isActive(signal)) throw error;
                return;
            }
            if (isActive(signal)) this.imageSizes.set(path, { width: image.naturalWidth, height: image.naturalHeight });
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
                    nodeCount: typeof source === "string" ? 2 : countSourceNodes(source, start, end),
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
                    nodeCount: typeof source === "string" ? 2 : countSourceNodes(source, start, end),
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
                nodeCount: typeof source === "string" ? 2 : countSourceNodes(source, start, end),
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
                boundary?.location
            );
            if (previous) {
                const separator = document.createElement("div");
                separator.className = "reading-carry";
                separator.setAttribute("aria-hidden", "true");
                separator.style.breakBefore = "column";
                // 非空断页载体保留下一段的原生上边距；等量负外边距使其净高度仍等于 carry。
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
        upper?: ContentLocation
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
                const node = this.createEpubSlice(piece.source, contentStart, contentEnd);
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
     */
    private createEpubSlice(source: SourceNode, start: number, end: number): Node | undefined {
        if ((source.end <= start && source.end > source.start) || (source.start >= end && source.end > source.start))
            return undefined;
        const node = source.node;
        if (node.type === "text") {
            return document.createTextNode(
                node.text.slice(Math.max(0, start - source.start), Math.min(node.text.length, end - source.start))
            );
        }
        let element: HTMLElement;
        if (node.type === "image") {
            const image = document.createElement("img");
            image.src = assertExists(this.urls.get(node.path), "Missing decoded EPUB image: " + node.path);
            image.alt = node.alt;
            const size = this.imageSizes.get(node.path);
            if (size) {
                image.width = size.width;
                image.height = size.height;
            }
            element = image;
        } else {
            element = document.createElement(node.tag);
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
                if (!child || child.start >= end) break;
                const result = this.createEpubSlice(child, start, end);
                if (result) element.append(result);
            }
            if (node.href) {
                element.setAttribute("href", "#");
                element.dataset["bookPath"] = node.href.path;
                element.dataset["bookFragment"] = node.href.fragment ?? "";
            }
            if (node.colSpan !== undefined) element.setAttribute("colspan", String(node.colSpan));
            if (node.rowSpan !== undefined) element.setAttribute("rowspan", String(node.rowSpan));
            if (node.start !== undefined) element.setAttribute("start", String(node.start));
            if (node.value !== undefined) element.setAttribute("value", String(node.value));
            if (node.reversed) element.setAttribute("reversed", "");
            if (node.dir) element.dir = source.direction ?? node.dir;
            if (blockTags.has(node.tag)) {
                if (source.start < start) element.style.marginBlockStart = "0";
                if (source.end > end) element.style.marginBlockEnd = "0";
                if (node.tag === "li" && source.start < start) element.style.listStyleType = "none";
            }
        }
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
function countSourceNodes(source: SourceNode, start: number, end: number): number {
    if (source.end <= start || source.start >= end) return 0;
    if (source.start >= start && source.end <= end) return source.nodeCount;
    let count = 1;
    let low = 0;
    let high = source.children.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const child = source.children[middle];
        if (child && child.end <= start) low = middle + 1;
        else high = middle;
    }
    for (let index = low; index < source.children.length; index++) {
        const child = source.children[index];
        if (!child || child.start >= end) break;
        count += countSourceNodes(child, start, end);
    }
    return count;
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
        if (child.type === "image" || child.dir) return undefined;
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
