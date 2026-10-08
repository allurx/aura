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
import EpubContent from "./epub-content";
import { endContentLocation, locateContentRange, locateContentRect, readContentLocation } from "./content-location";
import type { ContentLocation } from "./content-location";

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
    readonly pageNumber: number;
    readonly pageCount: number;
}

/**
 * 每章独立持有受控 DOM 和图片 URL，移出相邻章节窗口后释放。
 */
interface ChapterView {
    readonly chapter: Chapter;
    readonly element: HTMLElement;
    readonly epub: EpubContent | undefined;
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
    private file!: BookFile;
    private signal!: AbortSignal;
    private loadChapter!: (chapterNumber: number) => Promise<Chapter>;
    private chapterCount = 0;
    private mode: ReadingMode = "cover";
    private chapterNumber = 1;
    private pageIndex = 0;
    private pageCount = 1;
    private pageStride = 1;
    private scrollTimer: number | undefined;
    private layoutFrame: number | undefined;
    private position: ReadingPosition | undefined;
    private layout = "";
    private turning = false;
    private updating = false;
    private refreshPending = false;
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
        this.file = file;
        this.chapterCount = chapterCount;
        this.loadChapter = loadChapter;
        this.signal = signal;
        const resize = new ResizeObserver(() => {
            this.scheduleLayout();
        });
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
                    this.pageIndex = Math.min(
                        this.pageCount - 1,
                        Math.max(
                            0,
                            Math.floor((rect.left - section.getBoundingClientRect().left + 0.01) / this.pageStride)
                        )
                    );
                    this.viewport.scrollLeft = this.pageIndex * this.pageStride;
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
                styles.disconnect();
                this.cancelPendingScroll();
                if (this.layoutFrame !== undefined) cancelAnimationFrame(this.layoutFrame);
                this.transition?.skipTransition();
                for (const view of this.views.values()) view.epub?.destroy();
                this.views.clear();
                this.onLocationChange = undefined;
            },
            { once: true }
        );
        this.bindScroll(signal);
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
        this.mountViews();
        this.measure();
        if (position) this.restorePosition(position);
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
        return this.updating;
    }

    /**
     * 每次异步返回后重新读取生命周期，取消状态不沿用 await 之前的结果。
     */
    private isActive(): boolean {
        return !this.signal.aborted;
    }

    /**
     * 在未挂载的章节中完成安全渲染及图片解码，避免中间布局影响定位。
     */
    private async createView(chapter: Chapter): Promise<ChapterView> {
        const element = document.createElement("section");
        element.className = "reading-chapter";
        element.dataset["chapterNumber"] = String(chapter.chapterNumber);
        element.setAttribute("aria-label", chapter.title);
        let epub: EpubContent | undefined;
        if (chapter.kind === "epub" && this.file.format === "epub") {
            epub = new EpubContent(this.file.resources);
            try {
                await epub.render(element, chapter.blocks, this.signal, chapter.startAnchors);
            } catch (error) {
                epub.destroy();
                throw error;
            }
        } else if (chapter.kind === "text") {
            const heading = document.createElement("h2");
            heading.className = "chapter-heading";
            heading.textContent = chapter.title;
            element.append(heading);
            for (const [index, line] of chapter.lines.entries()) {
                const paragraph = document.createElement("p");
                paragraph.dataset["blockNumber"] = String(index + 1);
                paragraph.textContent = line;
                element.append(paragraph);
            }
        } else throw new Error("Content format does not match the opened book");
        return { chapter, element, epub };
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
            const view = this.views.get(number) ?? (await this.createView(await this.loadChapter(number)));
            prepared.push(view);
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
                            ? view.epub?.findAnchor(destination.fragment)?.getClientRects()[0]
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
            if (this.views.get(view.chapter.chapterNumber) !== view) view.epub?.destroy();
        }
    }

    /**
     * 替换相邻章节窗口，不累计整本书的 DOM 和图片 URL。
     */
    private install(views: readonly ChapterView[]): void {
        for (const previous of this.views.values()) {
            if (!views.includes(previous)) previous.epub?.destroy();
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
        this.updateEndSpace();
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
        return this.update(() => this.navigateToChapter(chapterNumber, target, direction));
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
            await this.changePage(() => {
                this.chapterNumber = chapterNumber;
                this.position = undefined;
                this.install(views);
                this.measure();
                if (target === "end") this.moveToEnd();
                else if (target === "start") this.restoreChapterStart();
                else if ("fragment" in target) this.scrollToFragment(target.fragment);
                else this.restoreLocation({ ...target, chapterNumber });
            }, direction);
        } finally {
            this.releasePrepared(views);
        }
    }

    /**
     * 原生滚动接近缓存边缘时按画面补窗，并释放远离视窗的章节。
     */
    private async maintainWindow(): Promise<void> {
        if (this.mode !== "scroll") return;
        const position = this.readPosition();
        const first = this.viewport.firstElementChild;
        const last = this.viewport.lastElementChild;
        if (!position || !first || !last) return;
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

        const views = await this.prepareWindow(position.location.chapterNumber, position.location, position.top);
        try {
            const current = this.readPosition();
            if (!this.isActive() || this.getMode() !== "scroll" || !current) return;
            if (!views.some(({ chapter }) => chapter.chapterNumber === current.location.chapterNumber)) {
                this.refreshPending = true;
                return;
            }
            this.install(views);
            this.measure();
            this.restorePosition(current);
        } finally {
            this.releasePrepared(views);
        }
    }

    /**
     * 按当前方式前进一页或一屏，章节边界及缓存补充都由正文完成。
     */
    public async turn(direction: ReadingDirection): Promise<boolean> {
        if (direction === ReadingDirection.INVALID) return false;
        return this.update(async () => {
            const step = direction === ReadingDirection.NEXT ? 1 : -1;
            if (this.mode === "scroll") {
                await this.maintainWindow();
                if (this.signal.aborted) return;
                const lineHeight = Number.parseFloat(getComputedStyle(this.root).lineHeight);
                this.viewport.scrollTop += step * Math.max(lineHeight, this.viewport.clientHeight - lineHeight);
                return;
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
    private async changePage(change: () => void, direction: ReadingDirection): Promise<void> {
        this.turning = true;
        const animated =
            direction !== ReadingDirection.INVALID &&
            (this.mode === "cover" || this.mode === "slide") &&
            typeof document.startViewTransition === "function" &&
            !matchMedia("(prefers-reduced-motion: reduce)").matches;
        try {
            if (!animated) {
                change();
                return;
            }
            document.documentElement.dataset["pageTurn"] = this.mode;
            document.documentElement.dataset["pageDirection"] =
                direction === ReadingDirection.NEXT ? "next" : "previous";
            this.viewport.style.viewTransitionName = "reading-page";
            const transition = document.startViewTransition(() => {
                if (!this.signal.aborted) change();
            });
            this.transition = transition;
            // 后台或并行视图切换可能跳过快照，导航结果仍通过 finished 确认。
            void transition.ready.catch(() => undefined);
            await transition.finished;
        } finally {
            this.transition = undefined;
            this.viewport.style.removeProperty("view-transition-name");
            delete document.documentElement.dataset["pageTurn"];
            delete document.documentElement.dataset["pageDirection"];
            this.turning = false;
        }
    }

    /**
     * 一个正文操作完成布局和窗口维护后，只向页面提交实际阅读快照。
     * 后续持久化独立排队，不占用排版互斥；异步失败仍进入统一错误入口。
     */
    private async update(action: () => Promise<void>): Promise<boolean> {
        if (this.updating || this.signal.aborted) return false;
        this.updating = true;
        this.cancelPendingScroll();
        try {
            await action();
            if (!this.isActive()) return false;
            await this.maintainWindow();
            if (!this.isActive()) return false;
            if (this.mode !== "scroll") {
                const current = this.views.get(this.chapterNumber);
                if (current && this.views.size > 1) this.install([current]);
            }
            const position = this.capturePosition();
            this.cancelPendingScroll();
            const snapshot = this.readSnapshot(position?.location);
            if (snapshot) run(() => this.onLocationChange?.(snapshot));
            return this.isActive();
        } finally {
            this.updating = false;
            if (this.refreshPending && this.isActive()) {
                this.refreshPending = false;
                this.scheduleLocationSync();
            }
        }
    }

    /**
     * 外观和焦点恢复明确请求位置同步，不再伪造原生 scroll 事件。
     */
    public async refreshLocation(): Promise<void> {
        if (this.views.size === 0 || this.signal.aborted) return;
        if (this.updating) {
            this.refreshPending = true;
            return;
        }
        await this.update(() => Promise.resolve());
    }

    /**
     * 真实书尾允许最后短章的章首置顶；留白只属于呈现，不参与源位置与进度。
     */
    private updateEndSpace(): void {
        const last = this.viewport.lastElementChild;
        const atEnd = this.mode === "scroll" && Number(last?.getAttribute("data-chapter-number")) === this.chapterCount;
        const space = atEnd && last ? Math.max(0, this.viewport.clientHeight - last.getBoundingClientRect().height) : 0;
        this.viewport.style.setProperty("--reading-end-space", `${String(space)}px`);
    }

    /**
     * 页数来自浏览器自然排版，列宽和页高使用实际正文视窗。
     */
    private measure(): void {
        this.updateEndSpace();
        const { width, height } = this.viewport.getBoundingClientRect();
        this.root.style.setProperty("--reading-page-width", `${String(width)}px`);
        this.root.style.setProperty("--reading-page-height", `${String(height)}px`);
        const element = this.views.get(this.chapterNumber)?.element;
        const gap = this.mode === "scroll" || !element ? 0 : Number.parseFloat(getComputedStyle(element).columnGap);
        this.pageStride = Math.max(1, width) + gap;
        this.pageCount =
            this.mode === "scroll" || !element || width === 0
                ? 1
                : Math.max(1, Math.round((element.scrollWidth + gap) / this.pageStride));
        this.pageIndex = Math.min(this.pageIndex, this.pageCount - 1);

        // 不依赖浏览器自动把滚动容器加入 Tab 顺序；只为实际溢出的正文保留键盘入口。
        for (const region of this.viewport.querySelectorAll<HTMLElement>("table, pre")) {
            if (region.scrollWidth > region.clientWidth + 1 || region.scrollHeight > region.clientHeight + 1) {
                region.tabIndex = 0;
            } else region.removeAttribute("tabindex");
        }
        this.layout = this.layoutSignature();
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
            style.lineHeight,
            style.getPropertyValue("--reader-paragraph-spacing"),
        ].join("|");
    }

    /**
     * 使用变化前保存的源锚点，统一处理 resize、字体和外观预览后的重排。
     */
    private scheduleLayout(): void {
        if (this.layoutFrame !== undefined || this.views.size === 0) return;
        this.layoutFrame = requestAnimationFrame(() => {
            this.layoutFrame = undefined;
            if (this.signal.aborted || this.layoutSignature() === this.layout) return;
            this.transition?.skipTransition();
            const position = this.position;
            this.measure();
            if (position) this.restorePosition(position);
            run(() => this.refreshLocation());
        });
    }

    /**
     * 滚动以视窗上缘所在章节为准，分页读取当前列中首个可见内容位置。
     */
    public readProgress(): ReadingLocation | undefined {
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
        if (this.isContentObscured() && this.position) return this.position;
        const location = this.readProgress();
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
        this.restoreLocation(position.location);
        const view = this.views.get(position.location.chapterNumber);
        if (view && this.mode === "scroll") {
            const rect = position.chapterStart
                ? view.element.getBoundingClientRect()
                : locateContentRect(view.element, position.location);
            if (rect) this.viewport.scrollTop += rect.top - this.viewport.getBoundingClientRect().top - position.top;
        }
        this.position = position;
        this.capturePosition();
    }

    /**
     * 将源位置映射到当前排版，不复用旧页码或块高度比例。
     */
    private restoreLocation(location: ReadingLocation): void {
        const view = this.views.get(location.chapterNumber);
        if (!view) return;
        this.chapterNumber = location.chapterNumber;
        if (this.mode !== "scroll" && view.element.parentElement !== this.viewport) this.mountViews();
        this.measure();
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
        return {
            location,
            chapter,
            mode: this.mode,
            canPrevious: current > 1 || (this.mode === "scroll" ? this.viewport.scrollTop > 1 : this.pageIndex > 0),
            canNext:
                current < this.chapterCount ||
                (this.mode === "scroll"
                    ? this.viewport.scrollTop + this.viewport.clientHeight < this.viewport.scrollHeight - 1
                    : this.pageIndex < this.pageCount - 1),
            pageNumber: this.pageIndex + 1,
            pageCount: this.pageCount,
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
        const target = this.views.get(this.chapterNumber)?.epub?.findAnchor(fragment);
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
        if (!this.isContentObscured()) this.position = this.readPosition();
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
            () => {
                if (this.turning || this.isContentObscured() || this.layoutSignature() !== this.layout) return;
                if (this.mode !== "scroll")
                    this.pageIndex = Math.min(
                        this.pageCount - 1,
                        Math.max(0, Math.round(this.viewport.scrollLeft / this.pageStride))
                    );
                this.capturePosition();
                this.scheduleLocationSync();
            },
            { passive: true, capture: true, signal }
        );
    }

    /**
     * 原生连续滚动结束后再维护窗口与保存位置，导航操作则直接提交。
     */
    private scheduleLocationSync(): void {
        this.cancelPendingScroll();
        this.scrollTimer = window.setTimeout(() => {
            this.scrollTimer = undefined;
            if (!this.signal.aborted) run(() => this.refreshLocation());
        }, 160);
    }

    /**
     * 监听已完成的正文位置变化，回调负责工具和进度持久化。
     */
    public bindLocationChange(handler: (snapshot: ReadingSnapshot) => Promise<void>): void {
        this.onLocationChange = handler;
    }
}
