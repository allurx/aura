/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type ChapterView from "./chapter-view";
import type { ChapterSeam } from "./chapter-view";
import type { ContentLocation } from "./content-location";
import { locateContentRange } from "./content-location";

/**
 * 可挂载的源片段窗口；分页起始页允许同时含有前一批末尾的内容。
 * top 与 height 只用于连续滚动的临时占位，不进入持久化位置。
 */
export interface ChapterLayoutWindow {
    readonly start: number;
    readonly end: number;
    readonly carry: number;
    readonly inlineCarry: number;
    readonly pageBase: number;
    readonly top: number;
    readonly height: number;
    readonly seams?: readonly ChapterSeam[];
}

/**
 * 已经过浏览器原生布局的批次，不包含估计的页码或高度。
 */
export interface ChapterLayoutBatch extends ChapterLayoutWindow {
    readonly endPage: number;
    // 上一页已达到单窗预算，前一批的源内容和排版相位不进入这组页面。
    readonly startsPageGroup: boolean;
}

// 单页可跨多个测量批次。极密的行内结构按此上限续到下一页，避免一个视窗挂载整章。
const MAX_BATCHES_PER_PAGE = 8;

/**
 * 已显示的源位置及其页内坐标；后台索引必须延续这份画面，不重新选择可见页。
 */
export interface ChapterLayoutSeed {
    readonly range: ChapterLayoutWindow;
    readonly location: ContentLocation;
    readonly top: number;
    readonly inline: number;
    readonly page: number;
    readonly followingPage?: ChapterSeam;
}

/**
 * 有界正文的精确排版索引。逐批续排并让出帧，实际窗口与索引共用同一片段投影。
 */
export default class ChapterLayout {
    public readonly batches: ChapterLayoutBatch[] = [];
    public complete = false;
    public pageCount: number | undefined;
    public totalHeight: number | undefined;
    public knownHeight = 0;
    private readonly mode: "paged" | "scroll";
    private readonly batchSize: number;
    private seams: readonly ChapterSeam[] = [];
    private seed: ChapterLayoutSeed | undefined;
    private seedPageBase: number | undefined;

    /**
     * 每批片段数是工作预算，不改变源内容身份，也不强制创建书页边界。
     */
    public constructor(
        private readonly view: ChapterView,
        { mode = "paged", batchSize = 64 }: { readonly mode?: "paged" | "scroll"; readonly batchSize?: number } = {}
    ) {
        this.mode = mode;
        this.batchSize = batchSize;
    }

    /**
     * 完整自然窗口已经排版时直接建立精确索引，不复制表格等不可拆分内容再次测量。
     * 续排位移与临时页界仍交给分批排版，不能把局部投影解释为完整章节。
     */
    public useCompleteWindow(
        viewport: HTMLElement,
        range: ChapterLayoutWindow,
        seed: ChapterLayoutSeed | undefined
    ): boolean {
        if (
            range.start !== 0 ||
            range.end !== this.view.pieceCount ||
            range.carry !== 0 ||
            range.inlineCarry !== 0 ||
            range.pageBase !== 0 ||
            range.top !== 0 ||
            range.seams?.length
        )
            return false;

        const section = this.view.element;
        const gap = Number.parseFloat(getComputedStyle(section).columnGap) || 0;
        const stride = Math.max(1, viewport.getBoundingClientRect().width + gap);
        const pageCount = this.mode === "paged" ? Math.max(1, Math.round((section.scrollWidth + gap) / stride)) : 1;
        const height = this.mode === "scroll" ? section.getBoundingClientRect().height : 0;

        this.seed = this.mode === "paged" ? seed : undefined;
        this.seedPageBase = this.seed ? 0 : undefined;
        this.batches.push({ ...range, height, endPage: pageCount - 1, startsPageGroup: true });
        this.pageCount = pageCount;
        this.totalHeight = height;
        this.knownHeight = height;
        this.complete = true;
        return true;
    }

    /**
     * probeViewport 使用实际正文宽高及样式；取消后不提交未完成的批次。
     */
    public async build(
        probeViewport: HTMLElement,
        signal: AbortSignal,
        onBatch: (batch: ChapterLayoutBatch) => void,
        seed?: ChapterLayoutSeed
    ): Promise<void> {
        this.seed = this.mode === "paged" ? seed : undefined;
        this.seedPageBase = undefined;
        const initialSeed = this.seed;
        // 可见页之前的临时页界不约束未显示的前缀；之后的页界仍属于当前窗口。
        this.seams = initialSeed
            ? (initialSeed.range.seams ?? []).filter(
                  ({ location }) => compareLocation(location, initialSeed.location) > 0
              )
            : [];
        const following = initialSeed?.followingPage;
        if (following && !this.seams.some(({ location }) => compareLocation(location, following.location) === 0))
            this.seams = [...this.seams, following];
        const boundaries = new Set(this.seams.map(({ location }) => this.view.pieceIndex(location)));
        const seedIndex = this.seed ? this.view.pieceIndex(this.seed.location) : undefined;
        if (seedIndex !== undefined) boundaries.add(seedIndex);
        let pageBase = 0;
        let batchesOnPage = 0;
        let startsPageGroup = true;
        let wantedTop: number | undefined;
        let wantedInline: number | undefined;
        for (let start = 0; start < this.view.pieceCount && !signal.aborted;) {
            let end = this.view.rangeEnd(start, this.batchSize);
            // 页界两侧在同一有限批次中测量，避免事后改变已发布前缀的孤行与断页结果。
            while (end < this.view.pieceCount && boundaries.has(end)) end++;
            const lookahead = Math.min(this.view.pieceCount, end + 1);
            const release = await this.view.prepareRange(start, lookahead, signal);
            if (!release) return;
            try {
                let carry = 0;
                let inlineCarry = 0;
                let section = this.view.renderRange(start, lookahead, 0, 0, this.seams);
                this.view.mountProjection(probeViewport, section);
                await waitForChapterLayout(section, signal);
                if (!isActive(signal)) return;

                let origin = section.getBoundingClientRect();
                const width = probeViewport.getBoundingClientRect().width;
                const gap = Number.parseFloat(getComputedStyle(section).columnGap) || 0;
                const stride = Math.max(1, width + gap);
                const first = layoutContentRect(section, this.view.pieceLocation(start));
                const top =
                    this.mode === "scroll" && wantedTop !== undefined && first
                        ? wantedTop - (first.top - origin.top) - leadingBlankSpace(section)
                        : 0;
                if (wantedInline !== undefined && first) {
                    const range = locateContentRange(section, this.view.pieceLocation(start));
                    const container = range?.startContainer;
                    const element = container instanceof Element ? container : container?.parentElement;
                    const rtl = element ? getComputedStyle(element).direction === "rtl" : false;
                    inlineCarry = (wantedInline - (first.left - origin.left)) * (rtl ? -1 : 1);
                }
                if (this.mode === "paged" && wantedTop !== undefined && first)
                    carry = wantedTop - (first.top - origin.top);
                if (carry !== 0 || inlineCarry !== 0) {
                    section = this.view.renderRange(start, lookahead, carry, inlineCarry, this.seams);
                    this.view.mountProjection(probeViewport, section);
                    await waitForChapterLayout(section, signal);
                    if (!isActive(signal)) return;
                    origin = section.getBoundingClientRect();
                }

                const currentSeed = this.seed;
                if (currentSeed && seedIndex !== undefined && seedIndex >= start && seedIndex < end) {
                    let anchored = layoutAnchorRect(section, currentSeed.location);
                    if (anchored) {
                        const page = Math.max(0, Math.floor((anchored.left - origin.left + 0.01) / stride));
                        const top = anchored.top - origin.top;
                        const inline = anchored.left - origin.left - page * stride;
                        if (Math.abs(top - currentSeed.top) >= 0.1 || Math.abs(inline - currentSeed.inline) >= 0.1) {
                            // 仅自然分页与已显示页失配时建立源页界；相位相同的刷新与尺寸往返不增加页面。
                            const pageStart =
                                compareLocation(currentSeed.location, this.view.pieceLocation(start)) !== 0;
                            const suffix = this.view.renderFrom(currentSeed.location, lookahead, pageStart);
                            this.view.mountProjection(probeViewport, suffix);
                            await waitForChapterLayout(suffix, signal);
                            if (!isActive(signal)) return;
                            const suffixOrigin = suffix.getBoundingClientRect();
                            const suffixRect = layoutAnchorRect(suffix, currentSeed.location);
                            if (suffixRect) {
                                const range = locateContentRange(suffix, currentSeed.location);
                                const container = range?.startContainer;
                                const element = container instanceof Element ? container : container?.parentElement;
                                const rtl = element ? getComputedStyle(element).direction === "rtl" : false;
                                const seam: ChapterSeam = {
                                    location: currentSeed.location,
                                    carry: currentSeed.top - (suffixRect.top - suffixOrigin.top),
                                    inlineCarry:
                                        (currentSeed.inline - (suffixRect.left - suffixOrigin.left)) * (rtl ? -1 : 1),
                                };
                                if (compareLocation(currentSeed.location, this.view.pieceLocation(start)) === 0) {
                                    carry = seam.carry;
                                    inlineCarry = seam.inlineCarry;
                                } else
                                    this.seams = [...this.seams, seam].toSorted((a, b) =>
                                        compareLocation(a.location, b.location)
                                    );
                            }
                            section = this.view.renderRange(start, lookahead, carry, inlineCarry, this.seams);
                            this.view.mountProjection(probeViewport, section);
                            await waitForChapterLayout(section, signal);
                            if (!isActive(signal)) return;
                            origin = section.getBoundingClientRect();
                            anchored = layoutAnchorRect(section, currentSeed.location);
                        }
                        if (anchored)
                            this.seedPageBase =
                                pageBase +
                                Math.max(0, Math.floor((anchored.left - origin.left + 0.01) / stride)) -
                                currentSeed.page;
                    }
                }

                const rectangle = layoutContentRect(section, this.view.pieceEndLocation(end - 1));
                const endPage =
                    this.mode === "paged"
                        ? pageBase +
                          Math.max(0, Math.floor(((rectangle?.left ?? origin.left) - origin.left + 0.01) / stride))
                        : 0;
                const next =
                    end < this.view.pieceCount ? layoutContentRect(section, this.view.pieceLocation(end)) : undefined;
                const nextPage = next ? Math.max(0, Math.floor((next.left - origin.left + 0.01) / stride)) : 0;
                wantedTop = next ? (this.mode === "scroll" ? top : 0) + next.top - origin.top : undefined;
                wantedInline =
                    next && this.view.continuesText(end)
                        ? next.left - origin.left - (this.mode === "paged" ? nextPage * stride : 0)
                        : undefined;

                let batchHeight = 0;
                if (this.mode === "scroll") {
                    // 源段落可在两批中共享一行；分别测量真实范围，不累加重叠行或四舍五入间距。
                    section = this.view.renderRange(start, end, 0, inlineCarry);
                    this.view.mountProjection(probeViewport, section);
                    await waitForChapterLayout(section, signal);
                    if (!isActive(signal)) return;
                    batchHeight = section.getBoundingClientRect().height;
                }
                const batch: ChapterLayoutBatch = {
                    start,
                    end,
                    carry,
                    inlineCarry,
                    pageBase,
                    endPage,
                    startsPageGroup,
                    top,
                    height: batchHeight,
                    ...(this.seams.length > 0 ? { seams: this.seams } : {}),
                };
                this.batches.push(batch);
                this.knownHeight = Math.max(this.knownHeight, top + batchHeight);
                if (end === this.view.pieceCount) {
                    this.pageCount =
                        this.mode === "paged"
                            ? pageBase + Math.max(1, Math.round((section.scrollWidth + gap) / stride))
                            : 1;
                    this.totalHeight = top + batchHeight;
                    this.complete = true;
                }
                onBatch(batch);
                pageBase += nextPage;
                // 同一物理页可以积累多个批次。极密内容到达预算后从新页开始，显示窗口也在此截断。
                batchesOnPage = nextPage > 0 ? 0 : batchesOnPage + 1;
                startsPageGroup = this.mode === "paged" && batchesOnPage >= MAX_BATCHES_PER_PAGE;
                if (startsPageGroup) {
                    wantedTop = undefined;
                    wantedInline = undefined;
                    pageBase = endPage + 1;
                    batchesOnPage = 0;
                }
                start = end;
                await nextFrame(signal);
            } finally {
                release();
            }
        }
        if (!signal.aborted && this.view.pieceCount === 0) {
            const section = this.view.renderRange(0, 0);
            this.view.mountProjection(probeViewport, section);
            await waitForChapterLayout(section, signal);
            if (!isActive(signal)) return;
            const gap = Number.parseFloat(getComputedStyle(section).columnGap) || 0;
            const stride = Math.max(1, probeViewport.getBoundingClientRect().width + gap);
            this.complete = true;
            this.pageCount = this.mode === "paged" ? Math.max(1, Math.round((section.scrollWidth + gap) / stride)) : 1;
            this.totalHeight = this.mode === "scroll" ? section.getBoundingClientRect().height : 0;
            this.knownHeight = this.totalHeight;
        }
    }

    /**
     * 只为仍在显示测量种子的窗口提供页码基数，不能把新的局部页界冒充旧索引的一部分。
     */
    public pageBaseForWindow(range: ChapterLayoutWindow): number | undefined {
        const seed = this.seed?.range;
        return range.start === seed?.start &&
            range.end === seed.end &&
            range.carry === seed.carry &&
            range.inlineCarry === seed.inlineCarry &&
            range.seams === seed.seams
            ? this.seedPageBase
            : undefined;
    }

    /**
     * 只有已完成测量的源范围才能用于准确页码。
     */
    public findLocation(location: ContentLocation): ChapterLayoutBatch | undefined {
        const index = this.view.pieceIndex(location);
        return this.batches.find((batch) => index >= batch.start && index < batch.end);
    }

    /**
     * 查找目标页上最早出现的测量批次。
     */
    public findPage(pageIndex: number): ChapterLayoutBatch | undefined {
        return this.batches.find((batch) => pageIndex >= batch.pageBase && pageIndex <= batch.endPage);
    }

    /**
     * 源位置窗口保留前后批次，保护批次交界处同一页中的全部内容。
     */
    public windowForLocation(location: ContentLocation): ChapterLayoutWindow | undefined {
        const batch = this.findLocation(location);
        return batch ? this.windowAround(batch) : undefined;
    }

    /**
     * 后续批次仍可能补充本页；出现下一页或完成全章后，才使用索引翻到这一页。
     */
    public windowForPage(pageIndex: number): ChapterLayoutWindow | undefined {
        const latest = this.batches.at(-1);
        if (!this.complete && (!latest || latest.endPage <= pageIndex)) return undefined;
        const batch = this.findPage(pageIndex);
        return batch ? this.windowAround(batch, pageIndex) : undefined;
    }

    /**
     * 取与目标页相交的所有批次。已经覆盖的相邻批次也提供排版上下文，不再向外多取一整批。
     * 预算分页两侧独立排版；滚动窗口只沿用当前批次与相邻上下文。
     */
    private windowAround(batch: ChapterLayoutBatch, pageIndex?: number): ChapterLayoutWindow {
        const index = this.batches.indexOf(batch);
        let firstIndex = index;
        let lastIndex = index;
        if (this.mode === "paged") {
            const firstPage = pageIndex ?? batch.pageBase;
            const lastPage = pageIndex ?? batch.endPage;
            while (firstIndex > 0 && (this.batches[firstIndex - 1]?.endPage ?? -1) >= firstPage) firstIndex--;
            while ((this.batches[lastIndex + 1]?.pageBase ?? Infinity) <= lastPage) lastIndex++;
        }
        const firstBatch = this.batches[firstIndex] ?? batch;
        const first =
            firstIndex < index || firstBatch.startsPageGroup ? firstBatch : (this.batches[index - 1] ?? batch);
        const lastBatch = this.batches[lastIndex] ?? batch;
        const next = this.batches[lastIndex + 1];
        const last = lastIndex === index && next && !next.startsPageGroup ? next : lastBatch;
        return {
            start: first.start,
            // 下一片段保留原段落/标题的断页上下文，窗口尾部不成为人为的段落结尾。
            end: Math.min(this.view.pieceCount, last.end + (last === lastBatch && !next?.startsPageGroup ? 1 : 0)),
            carry: first.carry,
            inlineCarry: first.inlineCarry,
            pageBase: first.pageBase,
            top: first.top,
            height: last.top + last.height - first.top,
            ...(this.seams.length > 0 ? { seams: this.seams } : {}),
        };
    }
}

/**
 * 内嵌滚动区的文字坐标由自身滚动决定，正文分页只对齐其原子外框。
 */
function layoutAnchorRect(section: HTMLElement, location: ContentLocation): DOMRect | undefined {
    const range = locateContentRange(section, location);
    const container = range?.startContainer;
    const element = container instanceof Element ? container : container?.parentElement;
    const region = element?.closest<HTMLElement>("table, pre");
    return region && section.contains(region) ? region.getBoundingClientRect() : layoutContentRect(section, location);
}

/**
 * 源位置按块号与块内偏移排序，不使用当前排版坐标。
 */
function compareLocation(a: ContentLocation, b: ContentLocation): number {
    return a.blockNumber - b.blockNumber || a.contentOffset - b.contentOffset;
}

/**
 * 布局衔接保留空块的零高盒；可见位置读取仍排除没有字符或媒体的空间。
 */
function layoutContentRect(section: HTMLElement, location: ContentLocation): DOMRect | undefined {
    const range = locateContentRange(section, location);
    if (!range) return undefined;
    let block = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    if (block === section) {
        const child = section.childNodes[range.startOffset];
        block = child instanceof Element ? child : null;
    }
    while (block && block.parentElement !== section) block = block.parentElement;
    const bounds = block?.getBoundingClientRect();
    if (bounds?.height === 0) return bounds;
    const rects = [...range.getClientRects()];
    // 空物理行不提供可见字符，但它的零高盒仍表达原生分栏位置和外边距的衔接点。
    return rects.find((rect) => rect.width > 0 && rect.height > 0) ?? rects.find((rect) => rect.height > 0) ?? rects[0];
}

/**
 * 连续空块的外边距在原流中只折叠一次；新 flow-root 不能再次把这段首留白计入前缀。
 * 用浏览器的实际盒位置读取折叠结果，不累计计算样式中尚未量化的 margin 数值。
 */
function leadingBlankSpace(section: HTMLElement): number {
    const first = section.firstElementChild?.getBoundingClientRect();
    if (!first || first.height > 0) return 0;
    for (const child of section.children) {
        const rect = child.getBoundingClientRect();
        if (rect.height > 0) return Math.max(0, rect.top - first.top);
    }
    return Math.max(0, section.getBoundingClientRect().bottom - first.top);
}

/**
 * 异步返回后重新读取生命周期，不沿用 await 前的收窄结果。
 */
function isActive(signal: AbortSignal): boolean {
    return !signal.aborted;
}

/**
 * 初次观察新测量节点在自然布局后派发，不在刚写入正文的任务内同步强制排版。
 */
export async function waitForChapterLayout(element: HTMLElement, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
        let timer: number | undefined;
        const finish = (): void => {
            observer.disconnect();
            if (timer !== undefined) clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
        };
        const observer = new ResizeObserver(() => {
            observer.disconnect();
            // 下一任务才允许安装下一片段和注册新观察，不能在同一轮通知中再次观察同层节点。
            timer = window.setTimeout(finish, 0);
        });
        signal.addEventListener("abort", finish, { once: true });
        observer.observe(element);
        if (signal.aborted) finish();
    });
}

/**
 * 每批提交后让出一帧；取消不等待后台标签页再次获得动画帧。
 */
async function nextFrame(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
        let frame = 0;
        const finish = (): void => {
            cancelAnimationFrame(frame);
            signal.removeEventListener("abort", finish);
            resolve();
        };
        signal.addEventListener("abort", finish, { once: true });
        frame = requestAnimationFrame(finish);
        if (signal.aborted) finish();
    });
}
