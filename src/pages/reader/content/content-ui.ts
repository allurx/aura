/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import { bind, run } from "@/utils/event-util";
import type Chapter from "@/domain/chapter/chapter";
import type BookFile from "@/domain/file/book-file";
import type { ReadingMode } from "../reading-mode";
import { ReadingDirection } from "../reading-direction";
import ChapterView from "./chapter-view";
import { endContentLocation, locateContentRange, locateContentRect, readContentLocation } from "./content-location";
import type { ContentLocation } from "./content-location";
import ChapterWindow from "./chapter-window";

/**
 * 阅读位置引用原始内容，页码仅由当前排版计算。
 */
export interface ReadingLocation extends ContentLocation {
    readonly chapterNumber: number;
}

/**
 * 同一处内容相对视窗的临时偏移，用于重排和章节窗口更新。
 */
export interface ReadingPosition {
    readonly location: ReadingLocation;
    readonly top: number;
    readonly chapterStart: boolean;
}

/**
 * 正文完成一次导航或重排后的同一份位置、章节与导航状态。
 */
export interface ReadingSnapshot {
    readonly location: ReadingLocation;
    readonly chapter: Chapter;
    readonly mode: ReadingMode;
    readonly canPrevious: boolean;
    readonly canNext: boolean;
    readonly pageNumber: number | undefined;
    readonly pageCount: number | undefined;
}

/**
 * 显式导航目的地，不把章首、章末或书内锚点混同为某个固定页码。
 */
type ChapterTarget = ContentLocation | "start" | "end" | { readonly fragment: string };

/**
 * 正文排版、内容锚点与翻页呈现。滚动保留相邻章节，分页由浏览器自然断行。
 */
export default class ContentUi extends Ui {
    private readonly viewport = document.createElement("div");
    private readonly views = new Map<number, ChapterView>();
    private readonly windows = new Map<ChapterView, ChapterWindow>();
    private activeWindow: ChapterWindow | undefined;
    // 临时预览的页首不等于章末；精确索引提交或实际导航后结束该定位意图。
    private pendingChapterEnd: ChapterWindow | undefined;
    private indexFrame: number | undefined;
    private indexRefreshPending = false;
    private epubResources: ReadonlyMap<string, Blob> | undefined;
    private signal!: AbortSignal;
    private loadChapter!: (chapterNumber: number) => Promise<Chapter>;
    private chapterCount = 0;
    private mode: ReadingMode = "cover";
    private chapterNumber = 1;
    private pageIndex = 0;
    private pageCount = 1;
    private pageStride = 1;
    private scrollTimer: number | undefined;
    private windowFrame: number | undefined;
    private resizeObserver: ResizeObserver | undefined;
    private layoutPending = false;
    private restorePending = false;
    private position: ReadingPosition | undefined;
    private layout = "";
    private turning = false;
    private updating = false;
    private refreshPending = false;
    private windowPending = false;
    private onLocationChange: ((snapshot: ReadingSnapshot) => Promise<void>) | undefined;
    private transition: ViewTransition | undefined;

    /**
     * main 持有正文外观，内部视窗承担分页裁切或原生滚动。
     */
    public constructor(root: HTMLElement) {
        super(root);
        this.viewport.className = "reading-viewport panel-scroll";
        this.root.append(this.viewport);
        this.root.dataset["readingMode"] = this.mode;
    }

    /**
     * 观察尺寸与字体变化，页面销毁时释放资源和未完成的视觉操作。
     */
    public init(
        file: BookFile,
        chapterCount: number,
        loadChapter: (chapterNumber: number) => Promise<Chapter>,
        signal: AbortSignal
    ): void {
        this.epubResources =
            file.format === "epub" ? new Map(file.resources.map(({ path, blob }) => [path, blob])) : undefined;
        this.chapterCount = chapterCount;
        this.loadChapter = loadChapter;
        this.signal = signal;
        const resize = new ResizeObserver(() => {
            // ResizeObserver 在本轮自然布局后、绘制前派发，尺寸变化可在同帧恢复锚点。
            this.flushLayout();
        });
        this.resizeObserver = resize;
        resize.observe(this.viewport);
        const styles = new MutationObserver(() => {
            this.scheduleLayout();
        });
        styles.observe(this.root, { attributes: true, attributeFilter: ["style"] });
        document.fonts.addEventListener(
            "loadingdone",
            () => {
                this.scheduleLayout();
            },
            { signal }
        );
        // 键盘聚焦后续列的书内链接时，显示其完整页面，而不是让浏览器停在半页位置。
        bind(
            this.root,
            "focusin",
            (event: FocusEvent) => {
                const target = event.target;
                if (this.mode === "scroll" || !(target instanceof HTMLElement) || target === this.root) return;
                queueMicrotask(() => {
                    if (signal.aborted || document.activeElement !== target) return;
                    const section = this.views.get(this.chapterNumber)?.element;
                    const rect = target.getClientRects()[0];
                    if (!section?.contains(target) || !rect) return;
                    const next = Math.min(
                        this.pageCount - 1,
                        Math.max(
                            0,
                            Math.floor((rect.left - section.getBoundingClientRect().left + 0.01) / this.pageStride)
                        )
                    );
                    const changedPage = next !== this.pageIndex;
                    this.pageIndex = next;
                    this.viewport.scrollLeft = this.pageIndex * this.pageStride;
                    if (changedPage) {
                        this.pendingChapterEnd = undefined;
                        this.capturePosition();
                    }
                    this.scheduleLocationSync();
                });
            },
            { signal }
        );
        window
            .matchMedia("(prefers-reduced-motion: reduce)")
            .addEventListener("change", () => this.transition?.skipTransition(), { signal });
        signal.addEventListener(
            "abort",
            () => {
                resize.disconnect();
                this.resizeObserver = undefined;
                styles.disconnect();
                this.cancelPendingScroll();
                if (this.windowFrame !== undefined) cancelAnimationFrame(this.windowFrame);
                if (this.indexFrame !== undefined) cancelAnimationFrame(this.indexFrame);
                for (const window of this.windows.values()) window.cancel();
                this.windows.clear();
                this.transition?.skipTransition();
                for (const view of this.views.values()) view.dispose();
                this.views.clear();
                this.epubResources = undefined;
                this.onLocationChange = undefined;
            },
            { once: true }
        );
        this.bindScroll(signal);
        const resumeIndex = (): void => {
            if (this.hasReadingInteraction()) return;
            if (this.indexRefreshPending && this.activeWindow) {
                this.indexRefreshPending = false;
                this.scheduleIndexCommit(this.activeWindow);
            }
            if (this.mode === "scroll") this.scheduleWindow();
        };
        document.addEventListener("selectionchange", resumeIndex, { signal });
        this.viewport.addEventListener(
            "focusout",
            () => {
                queueMicrotask(resumeIndex);
            },
            { signal }
        );
    }

    /**
     * 首次设置可早于数据库加载，模式变化后继续显示相同内容。
     */
    public setMode(mode: ReadingMode): void {
        if (mode === this.mode) return;
        const position = this.readPosition();
        this.transition?.skipTransition();
        this.mode = mode;
        this.root.dataset["readingMode"] = mode;
        if (this.views.size === 0) return;
        if (position) this.chapterNumber = position.location.chapterNumber;
        this.activeWindow?.cancel();
        this.activeWindow = undefined;
        for (const [view, window] of this.windows) {
            window.reset(
                mode,
                position?.location.chapterNumber === view.chapter.chapterNumber
                    ? position.location
                    : { blockNumber: 1, contentOffset: 0 }
            );
        }
        this.mountViews();
        if (position) this.restorePosition(position);
        else this.scheduleLayout();
        run(() => this.refreshLocation());
    }

    /**
     * 模式由正文持有，工具和输入只读取同一行为选择。
     */
    public getMode(): ReadingMode {
        return this.mode;
    }

    /**
     * 导航和窗口提交互斥；持久化不会另建一份正文忙状态。
     */
    public isBusy(): boolean {
        return this.updating || this.layoutPending;
    }

    /**
     * 每次异步返回后重新读取生命周期，取消状态不沿用 await 之前的结果。
     */
    private isActive(): boolean {
        return !this.signal.aborted;
    }

    /**
     * 按目标位置两侧的实际高度准备窗口，短章继续补充真实内容。
     * 新章节在不可交互的测量视窗中排版，加载失败不替换仍可阅读的正文。
     */
    private async prepareWindow(chapterNumber: number, target: ChapterTarget, top = 0): Promise<ChapterView[]> {
        const prepared: ChapterView[] = [];
        const measureViewport = document.createElement("div");
        measureViewport.className = this.viewport.className;
        measureViewport.inert = true;
        measureViewport.setAttribute("aria-hidden", "true");
        Object.assign(measureViewport.style, {
            position: "absolute",
            top: "0",
            left: "0",
            visibility: "hidden",
            pointerEvents: "none",
            width: `${String(this.viewport.getBoundingClientRect().width)}px`,
            height: `${String(this.viewport.getBoundingClientRect().height)}px`,
        });
        // 后续章节有章间留白；测量时保留相同的相邻选择器语义。
        const predecessor = document.createElement("section");
        predecessor.className = "reading-chapter";
        predecessor.style.height = "0";
        measureViewport.append(predecessor);
        if (this.mode === "scroll") this.root.append(measureViewport);

        /**
         * 当前窗口复用视图，新视图先登记以便失败时释放。
         */
        const getView = async (number: number): Promise<ChapterView> => {
            const view =
                this.views.get(number) ??
                (await ChapterView.create(await this.loadChapter(number), this.epubResources, this.signal));
            prepared.push(view);
            if (!this.isActive()) return view;
            if (view.pieceCount > view.rangeEnd(0) && !this.windows.has(view)) {
                const destination = number === chapterNumber ? target : number < chapterNumber ? "end" : "start";
                const location =
                    typeof destination === "object"
                        ? "fragment" in destination
                            ? (view.anchorLocation(destination.fragment) ?? { blockNumber: 1, contentOffset: 0 })
                            : destination
                        : destination === "end" && view.pieceCount > 0
                          ? view.pieceLocation(view.pieceCount - 1)
                          : { blockNumber: 1, contentOffset: 0 };
                this.windows.set(view, new ChapterWindow(view, this.mode, location));
            }
            return view;
        };
        /**
         * 已挂载章节直接读几何，新章节暂用同宽视窗，均保留原正文与内嵌滚动状态。
         */
        const measureView = (view: ChapterView, destination?: ChapterTarget): { height: number; offset: number } => {
            const detached = view.element.parentElement !== this.viewport;
            if (detached) {
                if (view.chapter.chapterNumber === 1) predecessor.remove();
                else if (!predecessor.parentElement) measureViewport.append(predecessor);
                measureViewport.append(view.element);
            }
            try {
                const bounds = view.element.getBoundingClientRect();
                const margin = Number.parseFloat(getComputedStyle(view.element).marginTop) || 0;
                let offset = 0;
                if (destination === "end") offset = Math.max(0, bounds.height - this.viewport.clientHeight);
                else if (destination && typeof destination !== "string") {
                    const rect =
                        "fragment" in destination
                            ? view.findAnchor(destination.fragment)?.getClientRects()[0]
                            : destination.blockNumber === 1 && destination.contentOffset === 0
                              ? undefined
                              : locateContentRect(view.element, destination);
                    if (rect) offset = Math.max(0, rect.top - bounds.top);
                }
                if (destination !== undefined) offset = Math.max(0, offset - top);
                // 当前章的 margin 在锚点之前，不能计入锚点之后的可读高度。
                return { height: bounds.height + (destination === undefined ? margin : 0), offset };
            } finally {
                if (detached) view.element.remove();
            }
        };

        try {
            const current = await getView(chapterNumber);
            if (this.signal.aborted || this.mode !== "scroll") return prepared;
            const viewportHeight = this.viewport.clientHeight;
            const metrics = measureView(current, target);
            let after = metrics.height - metrics.offset;
            let before = metrics.offset;

            // 正文后一屏预取，前一屏保留；数量由章高决定，不假定每章至少一屏。
            for (let number = chapterNumber + 1; after < viewportHeight * 2 && number <= this.chapterCount; number++) {
                const view = await getView(number);
                if (!this.isActive() || this.getMode() !== "scroll") return prepared;
                after += measureView(view).height;
            }
            for (let number = chapterNumber - 1; before < viewportHeight && number >= 1; number--) {
                const view = await getView(number);
                if (!this.isActive() || this.getMode() !== "scroll") return prepared;
                before += measureView(view).height;
            }
            return prepared.sort((a, b) => a.chapter.chapterNumber - b.chapter.chapterNumber);
        } catch (error) {
            this.releasePrepared(prepared);
            throw error;
        } finally {
            measureViewport.remove();
        }
    }

    /**
     * 只释放本次准备但未提交的视图，已安装资源仍由当前窗口持有。
     */
    private releasePrepared(views: readonly ChapterView[]): void {
        for (const view of views) {
            if (this.views.get(view.chapter.chapterNumber) !== view) {
                this.windows.get(view)?.cancel();
                this.windows.delete(view);
                view.dispose();
            }
        }
    }

    /**
     * 替换相邻章节窗口，不累计整本书的 DOM 和图片 URL。
     */
    private install(views: readonly ChapterView[]): void {
        for (const previous of this.views.values()) {
            if (!views.includes(previous)) {
                this.windows.get(previous)?.cancel();
                this.windows.delete(previous);
                previous.dispose();
            }
        }
        this.views.clear();
        for (const view of views) this.views.set(view.chapter.chapterNumber, view);
        this.mountViews();
    }

    /**
     * 分页只挂载当前章，滚动按阅读顺序拼接窗口中的相邻章。
     */
    private mountViews(): void {
        const visible = [...this.views.values()].filter(
            ({ chapter }) => this.mode === "scroll" || chapter.chapterNumber === this.chapterNumber
        );
        visible.sort((a, b) => a.chapter.chapterNumber - b.chapter.chapterNumber);
        const elements = visible.map(({ element }) => element);
        for (const element of [...this.viewport.children]) {
            if (!elements.some((visibleElement) => visibleElement === element)) element.remove();
        }
        for (const [index, element] of elements.entries()) {
            const next = this.viewport.children[index];
            if (next !== element) this.viewport.insertBefore(element, next ?? null);
        }
    }

    /**
     * 显式导航到内容位置或章首、章末，跨章和章内翻页使用相同过渡。
     */
    public async showChapter(
        chapterNumber: number,
        target: ChapterTarget,
        direction = ReadingDirection.INVALID
    ): Promise<boolean> {
        if (chapterNumber < 1 || chapterNumber > this.chapterCount) return false;
        return this.update(() => this.navigateToChapter(chapterNumber, target, direction), { preservePosition: true });
    }

    /**
     * 数据、排版和目标定位一起提交，控制器不再按布尔结果推断跨章行为。
     */
    private async navigateToChapter(
        chapterNumber: number,
        target: ChapterTarget,
        direction: ReadingDirection
    ): Promise<void> {
        const mode = this.mode;
        const views = await this.prepareWindow(chapterNumber, target);
        try {
            if (this.signal.aborted || this.mode !== mode) return;
            await this.changePage(async (animated) => {
                this.chapterNumber = chapterNumber;
                this.position = undefined;
                this.install(views);
                const view = this.views.get(chapterNumber);
                const window = view ? this.windows.get(view) : undefined;
                this.pendingChapterEnd = target === "end" && window && !window.layout.complete ? window : undefined;
                if (window) {
                    const location =
                        typeof target === "object"
                            ? "fragment" in target
                                ? (view?.anchorLocation(target.fragment) ?? { blockNumber: 1, contentOffset: 0 })
                                : target
                            : target === "end"
                              ? window.view.pieceLocation(window.view.pieceCount - 1)
                              : { blockNumber: 1, contentOffset: 0 };
                    window.showLocation(location);
                }
                const position = (): void => {
                    if (!this.isActive()) return;
                    this.measure();
                    if (target === "end") this.moveToEnd();
                    else if (target === "start") this.restoreChapterStart();
                    else if ("fragment" in target) this.scrollToFragment(target.fragment);
                    else this.restoreLocation({ ...target, chapterNumber });
                };
                // 快照更新暂停渲染，必须同步完成一次最终排版，不能等待 ResizeObserver。
                // 无快照的导航仍交给自然布局，避免在挂载正文后立即强制重排。
                if (animated) position();
                else await this.afterLayout(position);
            }, direction);
            this.startActiveLayout();
        } finally {
            this.releasePrepared(views);
        }
    }

    /**
     * 原生滚动接近缓存边缘时按画面补窗，并释放远离视窗的章节。
     */
    private async maintainWindow(): Promise<void> {
        if (this.mode !== "scroll") return;
        await this.maintainChapterWindow();
        if (!this.isActive()) return;
        const first = this.viewport.firstElementChild;
        const last = this.viewport.lastElementChild;
        if (!first || !last) return;
        const bounds = this.viewport.getBoundingClientRect();
        const firstNumber = Number(first.getAttribute("data-chapter-number"));
        const lastNumber = Number(last.getAttribute("data-chapter-number"));
        const needsBefore = firstNumber > 1 && first.getBoundingClientRect().top > bounds.top - bounds.height;
        const needsAfter =
            lastNumber < this.chapterCount && last.getBoundingClientRect().bottom < bounds.bottom + bounds.height;
        const trimBefore = first.nextElementSibling?.getBoundingClientRect().bottom;
        const trimAfter = last.previousElementSibling?.getBoundingClientRect().top;
        if (
            !needsBefore &&
            !needsAfter &&
            (trimBefore === undefined || trimBefore >= bounds.top - bounds.height * 2) &&
            (trimAfter === undefined || trimAfter <= bounds.bottom + bounds.height * 2)
        )
            return;

        const position = this.readPosition();
        if (!position) return;
        const views = await this.prepareWindow(position.location.chapterNumber, position.location, position.top);
        try {
            const current = this.readPosition();
            if (!this.isActive() || this.getMode() !== "scroll" || !current) return;
            if (!views.some(({ chapter }) => chapter.chapterNumber === current.location.chapterNumber)) {
                this.windowPending = true;
                return;
            }
            this.install(views);
            this.measure();
            this.applyPosition(current);
        } finally {
            this.releasePrepared(views);
        }
    }

    /**
     * 连续滚动在长章节内部也只保留可见源片段；大幅拖动滚动条时先呈现真实内容再保存。
     */
    private async maintainChapterWindow(): Promise<void> {
        const view = this.currentView();
        const window = view ? this.windows.get(view) : undefined;
        if (!view || !window) return;
        // 可见正文仍完整时延后回收正在操作的片段；显式滚动进入占位区时继续补齐内容。
        if (this.hasReadingInteraction() && !this.needsChapterWindow()) return;
        const viewport = this.viewport.getBoundingClientRect();
        const sourceElements = [...view.element.children].filter(
            (element): element is HTMLElement =>
                element instanceof HTMLElement &&
                (element.hasAttribute("data-block-number") || element.classList.contains("chapter-heading"))
        );
        const first = sourceElements[0]?.getBoundingClientRect();
        const last = sourceElements.at(-1)?.getBoundingClientRect();
        const outside = !first || !last || viewport.top < first.top - 1 || viewport.top >= last.bottom;
        const previous = outside ? undefined : this.readVisiblePosition();
        const requestedTop = Math.max(0, viewport.top - view.element.getBoundingClientRect().top);
        const indexedTarget = window.layout.batches.some(
            (batch) => requestedTop >= batch.top && requestedTop < batch.top + batch.height
        );
        const location = previous?.location ?? {
            ...window.locationAt(requestedTop),
            chapterNumber: view.chapter.chapterNumber,
        };
        const index = view.pieceIndex(location);
        const nearEdge = index < window.range.start + 3 || index >= window.range.end - 6;
        if (outside || nearEdge) {
            const changed = window.showLocation(location);
            if (changed) {
                await this.afterLayout(() => {
                    if (!this.isActive() || this.mode !== "scroll" || this.windows.get(view) !== window) return;
                    window.updateScrollSpace();
                    this.measure();
                    if (!previous && indexedTarget) {
                        // 滚动条可以落在已测批次中间；保留请求位置，再从实际正文读取源锚点。
                        this.viewport.scrollTop +=
                            view.element.getBoundingClientRect().top +
                            requestedTop -
                            this.viewport.getBoundingClientRect().top;
                        this.position = this.readVisiblePosition();
                        return;
                    }
                    this.applyPosition(
                        previous ?? {
                            location,
                            top: 0,
                            chapterStart: location.blockNumber === 1 && location.contentOffset === 0,
                        }
                    );
                });
            }
        }
        if (!this.isActive() || this.mode !== "scroll" || this.windows.get(view) !== window) return;
        this.chapterNumber = view.chapter.chapterNumber;
        this.startActiveLayout();
    }

    /**
     * 虚拟占位不能作为阅读内容。越出当前片段时等正文窗口完成后再采样进度。
     */
    private isOutsideChapterWindow(): boolean {
        const view = this.currentView();
        if (!view || !this.windows.has(view)) return false;
        const viewport = this.viewport.getBoundingClientRect();
        return ![...view.element.children].some(
            (element) =>
                element instanceof HTMLElement &&
                (element.hasAttribute("data-block-number") || element.classList.contains("chapter-heading")) &&
                [...element.getClientRects()].some((rect) => rect.bottom > viewport.top && rect.top < viewport.bottom)
        );
    }

    /**
     * 正文交互只延后视口外回收；可见区域开始出现未挂载空间时仍须补齐源内容。
     */
    private needsChapterWindow(): boolean {
        const view = this.currentView();
        const window = view ? this.windows.get(view) : undefined;
        if (!view || !window) return false;
        const bounds = this.viewport.getBoundingClientRect();
        const elements = [...view.element.children].filter(
            (element) => element.hasAttribute("data-block-number") || element.classList.contains("chapter-heading")
        );
        const first = elements[0]?.getBoundingClientRect();
        const last = elements.at(-1)?.getBoundingClientRect();
        return (
            !first ||
            !last ||
            (window.range.start > 0 && first.top > bounds.top) ||
            (window.range.end < view.pieceCount && last.bottom < bounds.bottom)
        );
    }

    /**
     * 按当前方式前进一页或一屏，章节边界及缓存补充都由正文完成。
     */
    public async turn(direction: ReadingDirection): Promise<boolean> {
        if (direction === ReadingDirection.INVALID) return false;
        return this.update(async () => {
            this.pendingChapterEnd = undefined;
            const step = direction === ReadingDirection.NEXT ? 1 : -1;
            if (this.mode === "scroll") {
                await this.maintainWindow();
                if (this.signal.aborted) return;
                const lineHeight = Number.parseFloat(getComputedStyle(this.root).lineHeight);
                this.viewport.scrollTop += step * Math.max(lineHeight, this.viewport.clientHeight - lineHeight);
                return;
            }
            const window = this.currentWindow();
            if (window) {
                const position = this.readPosition();
                const nearUnrendered =
                    step > 0
                        ? this.pageIndex >= this.pageCount - 2 && window.range.end < window.view.pieceCount
                        : this.pageIndex <= 1 && window.range.start > 0;
                if (nearUnrendered && position) {
                    const layout = window.layout;
                    const target =
                        step > 0
                            ? Math.min(window.view.pieceCount - 1, window.range.end)
                            : Math.max(0, window.range.start - 1);
                    if (layout.findLocation(window.view.pieceLocation(target))) window.showLocation(position.location);
                    else await window.shiftLocal(position.location, step, this.root, this.viewport, this.signal);
                    if (!this.isActive() || layout !== window.layout) return;
                    await this.afterLayout(() => {
                        if (!this.isActive() || layout !== window.layout) return;
                        this.measure();
                        this.applyPosition(position);
                    });
                    if (!this.isActive() || layout !== window.layout) return;
                }
                const globalNext = window.range.pageBase + this.pageIndex + step;
                const indexed = window.exact ? window.layout.windowForPage(globalNext) : undefined;
                if (indexed) {
                    await this.changePage(async (animated) => {
                        const changed = window.showPage(globalNext);
                        const move = (): void => {
                            this.measure();
                            this.pageIndex = globalNext - window.range.pageBase;
                            this.viewport.scrollLeft = this.pageIndex * this.pageStride;
                        };
                        if (changed && !animated) await this.afterLayout(move);
                        else move();
                    }, direction);
                    return;
                }
            }
            const next = this.pageIndex + step;
            if (next >= 0 && next < this.pageCount) {
                await this.changePage(() => {
                    this.pageIndex = next;
                    this.viewport.scrollLeft = next * this.pageStride;
                }, direction);
            } else {
                const chapterNumber = this.chapterNumber + step;
                if (chapterNumber >= 1 && chapterNumber <= this.chapterCount)
                    await this.navigateToChapter(chapterNumber, step < 0 ? "end" : "start", direction);
            }
        });
    }

    /**
     * 浏览器快照只移动正文视窗；减少动效或能力不可用时直接完成相同导航。
     */
    private async changePage(
        change: (animated: boolean) => void | Promise<void>,
        direction: ReadingDirection
    ): Promise<void> {
        this.turning = true;
        const animated =
            direction !== ReadingDirection.INVALID &&
            (this.mode === "cover" || this.mode === "slide") &&
            typeof document.startViewTransition === "function" &&
            !matchMedia("(prefers-reduced-motion: reduce)").matches;
        try {
            if (!animated) {
                await change(false);
                return;
            }
            document.documentElement.dataset["pageTurn"] = this.mode;
            document.documentElement.dataset["pageDirection"] =
                direction === ReadingDirection.NEXT ? "next" : "previous";
            const transition = document.startViewTransition(() => {
                if (!this.signal.aborted) return change(true);
            });
            this.transition = transition;
            // 后台或并行视图切换可能跳过快照，导航结果仍通过 finished 确认。
            void transition.ready.catch(() => undefined);
            await transition.finished;
        } finally {
            this.transition = undefined;
            delete document.documentElement.dataset["pageTurn"];
            delete document.documentElement.dataset["pageDirection"];
            this.turning = false;
        }
    }

    /**
     * 一个正文操作完成布局和窗口维护后，只向页面提交实际阅读快照。
     * 后续持久化独立排队，不占用排版互斥；异步失败仍进入统一错误入口。
     */
    private async update(
        action: () => Promise<void>,
        {
            preservePosition = false,
            persist = true,
        }: { readonly preservePosition?: boolean; readonly persist?: boolean } = {}
    ): Promise<boolean> {
        if (this.updating || this.signal.aborted) return false;
        this.updating = true;
        if (persist) this.cancelPendingScroll();
        try {
            await action();
            if (!this.isActive()) return false;
            await this.maintainWindow();
            if (!this.isActive()) return false;
            if (this.mode !== "scroll") {
                const current = this.views.get(this.chapterNumber);
                if (current && this.views.size > 1) this.install([current]);
            }
            const position = preservePosition ? (this.position ?? this.readPosition()) : this.capturePosition();
            this.position = position;
            if (persist) {
                this.cancelPendingScroll();
                const snapshot = this.readSnapshot(position?.location);
                if (snapshot) run(() => this.onLocationChange?.(snapshot));
            }
            return this.isActive();
        } finally {
            this.updating = false;
            if (this.windowPending && this.isActive()) {
                this.windowPending = false;
                this.scheduleWindow();
            }
            if (this.refreshPending && this.isActive()) {
                this.refreshPending = false;
                this.scheduleLocationSync();
            }
        }
    }

    /**
     * 外观和焦点恢复明确请求位置同步，不再伪造原生 scroll 事件。
     * 已请求重排时由布局回调发布最终快照；本次请求直接返回，退出仍可读取稳定源锚点。
     */
    public async refreshLocation(): Promise<void> {
        if (this.views.size === 0 || this.signal.aborted) return;
        if (this.layoutPending) return;
        if (this.updating) {
            this.refreshPending = true;
            return;
        }
        await this.update(() => Promise.resolve(), { preservePosition: true });
    }

    /**
     * 真实书尾允许最后短章的章首置顶；留白只属于呈现，不参与源位置与进度。
     */
    private updateEndSpace(): void {
        if (this.mode !== "scroll") return;
        const last = this.viewport.lastElementChild;
        const atEnd = Number(last?.getAttribute("data-chapter-number")) === this.chapterCount;
        const space = atEnd && last ? Math.max(0, this.viewport.clientHeight - last.getBoundingClientRect().height) : 0;
        const value = `${String(space)}px`;
        const previous = this.viewport.style.getPropertyValue("--reading-end-space");
        if (previous !== value && (space !== 0 || previous))
            this.viewport.style.setProperty("--reading-end-space", value);
    }

    /**
     * 页数来自浏览器自然排版，列宽和页高使用实际正文视窗。
     */
    private measure(): void {
        const { width } = this.viewport.getBoundingClientRect();
        const element = this.views.get(this.chapterNumber)?.element;
        const gap = this.mode === "scroll" || !element ? 0 : Number.parseFloat(getComputedStyle(element).columnGap);
        this.pageStride = Math.max(1, width) + gap;
        this.pageCount =
            this.mode === "scroll" || !element || width === 0
                ? 1
                : Math.max(1, Math.round((element.scrollWidth + gap) / this.pageStride));
        this.pageIndex = Math.min(this.pageIndex, this.pageCount - 1);

        // 不依赖浏览器自动把滚动容器加入 Tab 顺序；只为实际溢出的正文保留键盘入口。
        const regions = [...this.viewport.querySelectorAll<HTMLElement>("table, pre")].map((region) => ({
            region,
            overflowing: region.scrollWidth > region.clientWidth + 1 || region.scrollHeight > region.clientHeight + 1,
        }));
        this.layout = this.layoutSignature();
        this.updateEndSpace();
        for (const { region, overflowing } of regions) {
            if (overflowing) {
                region.tabIndex = 0;
            } else region.removeAttribute("tabindex");
        }
    }

    /**
     * 签名排除颜色和动画，防止无关外观变化干扰阅读位置。
     */
    private layoutSignature(): string {
        const style = getComputedStyle(this.root);
        return [
            this.mode,
            this.viewport.getBoundingClientRect().width,
            this.viewport.getBoundingClientRect().height,
            this.viewport.firstElementChild?.getBoundingClientRect().width ?? 0,
            style.fontFamily,
            style.fontSize,
            style.letterSpacing,
            style.lineHeight,
            style.getPropertyValue("--reader-paragraph-spacing"),
            style.getPropertyValue("--reader-page-margin"),
        ].join("|");
    }

    /**
     * 使用变化前保存的源锚点，统一处理 resize、字体和外观预览后的重排。
     */
    private scheduleLayout(): void {
        if (this.layoutPending || this.views.size === 0 || this.signal.aborted || !this.resizeObserver) return;
        this.layoutPending = true;
        // 新观察会在自然布局后首次派发，即使字体变化没有改变视窗的外部尺寸。
        // 统一在绘制前读取排版和恢复锚点，不通过 rAF 中的几何读取强制布局。
        this.resizeObserver.unobserve(this.viewport);
        this.resizeObserver.observe(this.viewport);
    }

    /**
     * 自然布局后的尺寸观察合并恢复同一源锚点，不重复写回页面尺寸。
     */
    private flushLayout(): void {
        if (this.signal.aborted || this.views.size === 0) return;
        this.layoutPending = false;
        if (!this.restorePending && this.layoutSignature() === this.layout) return;
        this.restorePending = false;
        this.transition?.skipTransition();
        const position = this.position;
        if (this.layoutSignature() !== this.layout) {
            // 相邻长章共享字号和视窗条件，也要废弃旧索引；只为当前章重新启动测量。
            for (const [view, window] of this.windows) {
                const location =
                    position?.location.chapterNumber === view.chapter.chapterNumber
                        ? position.location
                        : view.pieceLocation(window.range.start);
                window.reset(this.mode, location, true);
            }
            this.activeWindow = undefined;
        }
        this.measure();
        if (position) this.applyPosition(position);
        this.startActiveLayout();
        // 几何恢复仍在绘制前完成；窗口维护放到下一任务，避免在同轮观察通知中再次观察视窗。
        this.scheduleLocationSync(0);
    }

    /**
     * 章节总量只进入异步索引，当前帧与当前源位置附近的有限正文发生布局关系。
     */
    private currentWindow(): ChapterWindow | undefined {
        const view = this.views.get(this.chapterNumber);
        return view ? this.windows.get(view) : undefined;
    }

    /**
     * 只为正在阅读的长章节保留一个测量任务，导航与设置不等待全章索引。
     */
    private startActiveLayout(): void {
        const window = this.currentWindow();
        if (window === this.activeWindow) return;
        this.activeWindow?.cancel();
        this.activeWindow = window;
        window?.build(this.root, this.viewport, this.signal, () => {
            this.scheduleIndexCommit(window);
        });
    }

    /**
     * 索引结果只在自然渲染帧提交；重排或导航中的新源位置优先于启动时的旧位置。
     */
    private scheduleIndexCommit(window: ChapterWindow): void {
        if (this.indexFrame !== undefined || this.signal.aborted || window !== this.activeWindow) return;
        this.indexFrame = requestAnimationFrame(() => {
            this.indexFrame = undefined;
            if (!this.isActive() || window !== this.activeWindow) return;
            if (this.updating || this.layoutPending || this.turning) {
                this.scheduleIndexCommit(window);
                return;
            }
            const position = this.readPosition();
            if (position?.location.chapterNumber !== window.view.chapter.chapterNumber) return;
            const wasExact = window.exact;
            const ending = this.pendingChapterEnd === window;
            if (ending && !window.layout.complete) return;
            const batch = window.layout.findLocation(position.location);
            const shouldMount = ending || (batch !== undefined && !wasExact);
            if (!shouldMount && !window.layout.complete) return;
            if (this.hasReadingInteraction()) {
                this.indexRefreshPending = true;
                return;
            }
            if (!shouldMount && this.mode !== "scroll") {
                const snapshot = this.readSnapshot();
                if (snapshot) run(() => this.onLocationChange?.(snapshot));
                return;
            }
            this.layoutPending = true;
            if (shouldMount) {
                window.showLocation(
                    ending ? window.view.pieceEndLocation(window.view.pieceCount - 1) : position.location
                );
            }
            run(async () => {
                await this.afterLayout(() => {
                    if (!this.isActive() || window !== this.activeWindow) return;
                    window.updateScrollSpace();
                    this.measure();
                    if (ending && this.pendingChapterEnd === window) {
                        this.pendingChapterEnd = undefined;
                        this.position = undefined;
                        this.moveToEnd();
                        this.position = this.readVisiblePosition();
                    } else this.applyPosition(position);
                    this.layoutPending = false;
                });
                if (this.isActive() && window === this.activeWindow) await this.refreshLocation();
            });
        });
    }

    /**
     * 后台排版不能回收正在选择或操作的正文；显式导航仍由用户主动决定。
     */
    private hasReadingInteraction(): boolean {
        const selection = document.getSelection();
        return (
            Boolean(selection && !selection.isCollapsed && this.viewport.contains(selection.anchorNode)) ||
            (document.activeElement !== this.viewport && this.viewport.contains(document.activeElement))
        );
    }

    /**
     * 新章节在自然布局后、绘制前定位；下一任务再让页面初始化继续注册其他观察器。
     * 避免在 ResizeObserver 的微任务中新增更浅层观察而触发未交付通知错误。
     */
    private async afterLayout(action: () => void): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            let timer: number | undefined;
            const finish = () => {
                observer.disconnect();
                if (timer !== undefined) clearTimeout(timer);
                this.signal.removeEventListener("abort", finish);
                resolve();
            };
            const observer = new ResizeObserver(() => {
                observer.disconnect();
                try {
                    action();
                } catch (error) {
                    this.signal.removeEventListener("abort", finish);
                    reject(new Error("Failed to position reading content after layout", { cause: error }));
                    return;
                }
                timer = window.setTimeout(finish, 0);
            });
            observer.observe(this.viewport);
            this.signal.addEventListener("abort", finish, { once: true });
            if (this.signal.aborted) finish();
        });
    }

    /**
     * 分页保留实际导航选定的源锚点，重排的新页首不能覆盖它。
     */
    public readProgress(): ReadingLocation | undefined {
        if (this.mode !== "scroll" && this.position) return this.position.location;
        return this.readVisibleProgress();
    }

    /**
     * 滚动以视窗上缘所在章节为准，分页读取当前列中首个可见内容位置。
     */
    private readVisibleProgress(): ReadingLocation | undefined {
        if (this.isContentObscured() && this.position) return this.position.location;
        const view = this.currentView();
        if (!view) return undefined;
        const bounds = this.viewport.getBoundingClientRect();
        // 部分浏览器将 scrollLeft 量化到整像素，不把相邻页不足一像素的残边当成正文。
        const viewport =
            this.mode === "scroll"
                ? bounds
                : new DOMRect(bounds.left + 1, bounds.top, Math.max(0, bounds.width - 2), bounds.height);
        const candidates =
            this.mode === "scroll"
                ? [...this.views.values()]
                      .filter(({ chapter }) => chapter.chapterNumber >= view.chapter.chapterNumber)
                      .sort((a, b) => a.chapter.chapterNumber - b.chapter.chapterNumber)
                : [view];
        for (const candidate of candidates) {
            const location = readContentLocation(candidate.element, viewport);
            if (location) return { chapterNumber: candidate.chapter.chapterNumber, ...location };
        }
        const location = endContentLocation(view.element) ?? { blockNumber: 1, contentOffset: 0 };
        return { chapterNumber: view.chapter.chapterNumber, ...location };
    }

    /**
     * 章间留白归到即将进入的下一章。
     */
    private currentView(): ChapterView | undefined {
        if (this.mode !== "scroll") return this.views.get(this.chapterNumber);
        const top = this.viewport.getBoundingClientRect().top;
        const views = [...this.views.values()].sort((a, b) => a.chapter.chapterNumber - b.chapter.chapterNumber);
        return views.find(({ element }) => element.getBoundingClientRect().bottom > top + 1) ?? views.at(-1);
    }

    /**
     * 保存文字位置和可视偏移，章首单独保留以保护标题及其留白。
     */
    public readPosition(): ReadingPosition | undefined {
        if (this.mode !== "scroll" && this.position) return this.position;
        return this.readVisiblePosition();
    }

    /**
     * 只在实际阅读导航后采样当前画面，布局恢复沿用原源锚点。
     */
    private readVisiblePosition(): ReadingPosition | undefined {
        if (this.isContentObscured() && this.position) return this.position;
        const location = this.readVisibleProgress();
        if (!location) return undefined;
        const view = this.views.get(location.chapterNumber);
        if (!view) return undefined;
        const viewport = this.viewport.getBoundingClientRect();
        const chapterStart = location.blockNumber === 1 && location.contentOffset === 0;
        const rect = chapterStart ? view.element.getBoundingClientRect() : locateContentRect(view.element, location);
        return { location, top: (rect?.top ?? viewport.top) - viewport.top, chapterStart };
    }

    /**
     * 分页恢复包含锚点的页，滚动保留同一内容相对视窗的距离。
     */
    public restorePosition(position: ReadingPosition): void {
        this.position = position;
        this.restorePending = true;
        this.scheduleLayout();
    }

    /**
     * 在排版已测量后恢复位置；外部请求通过 restorePosition 合并到布局恢复阶段。
     */
    private applyPosition(position: ReadingPosition): void {
        this.restoreLocation(position.location);
        const view = this.views.get(position.location.chapterNumber);
        if (view && this.mode === "scroll") {
            const rect = position.chapterStart
                ? view.element.getBoundingClientRect()
                : locateContentRect(view.element, position.location);
            if (rect) this.viewport.scrollTop += rect.top - this.viewport.getBoundingClientRect().top - position.top;
        }
        this.position = position;
    }

    /**
     * 将源位置映射到当前排版，不复用旧页码或块高度比例。
     */
    private restoreLocation(location: ReadingLocation): void {
        const view = this.views.get(location.chapterNumber);
        if (!view) return;
        this.chapterNumber = location.chapterNumber;
        if (this.mode !== "scroll" && view.element.parentElement !== this.viewport) this.mountViews();
        if (location.blockNumber === 1 && location.contentOffset === 0) {
            this.restoreChapterStart();
            return;
        }
        this.restoreNestedScroll(view.element, location);
        const rect = locateContentRect(view.element, location);
        if (!rect) return;
        const viewport = this.viewport.getBoundingClientRect();
        if (this.mode === "scroll") this.viewport.scrollTop += rect.top - viewport.top;
        else {
            this.pageIndex = Math.min(
                this.pageCount - 1,
                Math.max(
                    0,
                    Math.floor((rect.left - view.element.getBoundingClientRect().left + 0.01) / this.pageStride)
                )
            );
            this.viewport.scrollLeft = this.pageIndex * this.pageStride;
        }
        this.position = { location, top: this.mode === "scroll" ? 0 : rect.top - viewport.top, chapterStart: false };
    }

    /**
     * 先恢复表格等内嵌滚动区域，再计算正文页码，避免把表格内列误当作书页。
     */
    private restoreNestedScroll(section: HTMLElement, location: ContentLocation): void {
        const range = locateContentRange(section, location);
        if (!range) return;
        const regions: { element: HTMLElement; x: boolean; y: boolean }[] = [];
        let element =
            range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement;
        while (element && element !== section && section.contains(element)) {
            const style = getComputedStyle(element);
            const x = ["auto", "scroll"].includes(style.overflowX) && element.scrollWidth > element.clientWidth;
            const y = ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight;
            if (x || y) regions.push({ element, x, y });
            element = element.parentElement;
        }
        if (regions.length === 0) return;

        // WebKit 会把跨列滚动容器中的 Range 错误映射到相邻列。
        // 同步在同宽、不分栏的布局中恢复内部滚动，随后还原列与外层位置，不重建正文。
        const columnWidth = section.style.columnWidth;
        const scrollLeft = this.viewport.scrollLeft;
        if (this.mode !== "scroll") section.style.columnWidth = "auto";
        try {
            for (const { element: region, x, y } of regions) {
                const rect = range.getBoundingClientRect();
                const bounds = region.getBoundingClientRect();
                if (y) region.scrollTop += rect.top - bounds.top - region.clientTop;
                if (x) region.scrollLeft += rect.left - bounds.left - region.clientLeft;
            }
        } finally {
            if (columnWidth) section.style.columnWidth = columnWidth;
            else section.style.removeProperty("column-width");
            this.viewport.scrollLeft = scrollLeft;
        }
    }

    /**
     * 显式选章从标题开始；相邻翻页回退由 moveToEnd 定位末页。
     */
    private restoreChapterStart(): void {
        const view = this.views.get(this.chapterNumber);
        this.pageIndex = 0;
        this.viewport.scrollLeft = 0;
        if (view && this.mode === "scroll")
            this.viewport.scrollTop +=
                view.element.getBoundingClientRect().top - this.viewport.getBoundingClientRect().top;
        else this.viewport.scrollTop = 0;
        this.position = {
            location: { chapterNumber: this.chapterNumber, blockNumber: 1, contentOffset: 0 },
            top: 0,
            chapterStart: true,
        };
    }

    /**
     * 回退跨章显示上一章末页，保留阅读接续。
     */
    private moveToEnd(): void {
        const view = this.views.get(this.chapterNumber);
        if (this.mode === "scroll" && view)
            this.viewport.scrollTop +=
                view.element.getBoundingClientRect().bottom - this.viewport.getBoundingClientRect().bottom;
        else {
            this.pageIndex = this.pageCount - 1;
            this.viewport.scrollLeft = this.pageIndex * this.pageStride;
        }
    }

    /**
     * 暴露导航边界和当前页，控制器无需读取布局或像素。
     */
    public readSnapshot(location: ReadingLocation | undefined = this.readProgress()): ReadingSnapshot | undefined {
        const chapter = location ? this.views.get(location.chapterNumber)?.chapter : undefined;
        if (!location || !chapter) return undefined;
        const current = location.chapterNumber;
        const window = this.currentWindow();
        return {
            location,
            chapter,
            mode: this.mode,
            canPrevious:
                current > 1 ||
                (this.mode === "scroll"
                    ? this.viewport.scrollTop > 1
                    : this.pageIndex > 0 || (window?.range.start ?? 0) > 0),
            canNext:
                current < this.chapterCount ||
                (this.mode === "scroll"
                    ? this.viewport.scrollTop + this.viewport.clientHeight < this.viewport.scrollHeight - 1
                    : this.pageIndex < this.pageCount - 1 ||
                      (window !== undefined && window.range.end < window.view.pieceCount)),
            pageNumber: window
                ? window.exact
                    ? this.pageIndex + window.range.pageBase + 1
                    : undefined
                : this.pageIndex + 1,
            pageCount: window ? window.layout.pageCount : this.pageCount,
        };
    }

    /**
     * 受控书内链接交给控制器，不拼接原书片段为选择器。
     */
    public bindBookLinks(handler: (path: string, fragment: string) => Promise<void>, signal: AbortSignal): void {
        bind(
            this.root,
            "click",
            async (event: MouseEvent) => {
                if (!(event.target instanceof Element)) return;
                const link = event.target.closest<HTMLElement>("a[data-book-path]");
                if (!link || !this.root.contains(link)) return;
                event.preventDefault();
                await handler(link.dataset["bookPath"] ?? "", link.dataset["bookFragment"] ?? "");
            },
            { signal }
        );
    }

    /**
     * 定位书内锚点所在页，滚动方式将目标移到视窗上缘。
     */
    private scrollToFragment(fragment: string): void {
        const target = this.views.get(this.chapterNumber)?.findAnchor(fragment);
        if (!fragment) this.restoreChapterStart();
        else if (target) {
            const rect = target.getClientRects()[0];
            if (!rect) return;
            const viewport = this.viewport.getBoundingClientRect();
            if (this.mode === "scroll") this.viewport.scrollTop += rect.top - viewport.top;
            else {
                this.pageIndex = Math.min(
                    this.pageCount - 1,
                    Math.max(
                        0,
                        Math.floor((rect.left - viewport.left + this.viewport.scrollLeft + 0.01) / this.pageStride)
                    )
                );
                this.viewport.scrollLeft = this.pageIndex * this.pageStride;
            }
        }
    }

    /**
     * 在稳定布局中保留重排前的源锚点。
     */
    private capturePosition(): ReadingPosition | undefined {
        if (!this.isContentObscured()) this.position = this.readVisiblePosition();
        return this.position;
    }

    /**
     * 模态背景和后台页面无法可靠地做原生命中检测，沿用最后一次可见内容锚点。
     */
    private isContentObscured(): boolean {
        return document.visibilityState === "hidden" || document.querySelector("dialog:modal") !== null;
    }

    /**
     * 取消延迟保存，显式导航和退出直接保存有效位置。
     */
    public cancelPendingScroll(): void {
        if (this.scrollTimer !== undefined) clearTimeout(this.scrollTimer);
        this.scrollTimer = undefined;
    }

    /**
     * 原生滚动结束后同步源位置，也保存独占当前页的内嵌表格位置。
     */
    private bindScroll(signal: AbortSignal): void {
        bind(
            this.viewport,
            "scroll",
            (event: Event) => {
                if (
                    this.turning ||
                    this.updating ||
                    this.layoutPending ||
                    this.isContentObscured() ||
                    this.layoutSignature() !== this.layout
                )
                    return;
                if (this.mode === "scroll" && this.isOutsideChapterWindow()) {
                    this.scheduleWindow();
                    this.scheduleLocationSync();
                    return;
                }
                if (this.mode !== "scroll") {
                    // 排版恢复与翻页会延后派发 scroll；所在页未改变时不能重新采样页首。
                    if (
                        event.target === this.viewport &&
                        Math.abs(this.viewport.scrollLeft - this.pageIndex * this.pageStride) < 1
                    )
                        return;
                    this.pageIndex = Math.min(
                        this.pageCount - 1,
                        Math.max(0, Math.round(this.viewport.scrollLeft / this.pageStride))
                    );
                }
                this.pendingChapterEnd = undefined;
                this.capturePosition();
                if (this.mode === "scroll") this.scheduleWindow();
                this.scheduleLocationSync();
            },
            { passive: true, capture: true, signal }
        );
    }

    /**
     * 原生滚动按帧检查窗口边界，预取不等待进度保存的防抖周期。
     */
    private scheduleWindow(): void {
        if (this.windowFrame !== undefined || this.mode !== "scroll" || this.signal.aborted) return;
        this.windowFrame = requestAnimationFrame(() => {
            this.windowFrame = undefined;
            if (this.signal.aborted || this.mode !== "scroll") return;
            if (this.updating) {
                this.windowPending = true;
                return;
            }
            run(async () => {
                await this.update(() => Promise.resolve(), { preservePosition: true, persist: false });
            });
        });
    }

    /**
     * 连续滚动结束后合并保存源位置，窗口预取与显式导航不受此延迟约束。
     */
    private scheduleLocationSync(delay = 160): void {
        this.cancelPendingScroll();
        this.scrollTimer = window.setTimeout(() => {
            this.scrollTimer = undefined;
            if (!this.signal.aborted) run(() => this.refreshLocation());
        }, delay);
    }

    /**
     * 监听已完成的正文位置变化，回调负责工具和进度持久化。
     */
    public bindLocationChange(handler: (snapshot: ReadingSnapshot) => Promise<void>): void {
        this.onLocationChange = handler;
    }
}
