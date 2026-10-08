/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import { getBookTitle } from "@/domain/file/book-format";
import { assertExists } from "@/utils/assert-util";
import { bind } from "@/utils/event-util";
import { ReadingDirection } from "./reading-direction";
import bindReadingGestures from "./reading-gestures";
import type { ReadingMode } from "./reading-mode";

/**
 * 阅读器工具分组、跨设备布局和移动沉浸状态。
 */
export default class ReaderUi extends Ui {
    private readonly actions = assertExists(this.root.querySelector<HTMLElement>("#reader-actions"));
    private readonly previousButton = assertExists(this.actions.querySelector<HTMLButtonElement>("#previous-page"));
    private readonly nextButton = assertExists(this.actions.querySelector<HTMLButtonElement>("#next-page"));
    private readonly returnButton = assertExists(this.root.querySelector<HTMLButtonElement>("#return-bookshelf"));
    private readonly tocButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-toc-panel"));
    private readonly settingButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-setting-panel"));
    private readonly fullscreenButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-fullscreen"));
    private readonly header = assertExists(this.root.querySelector<HTMLElement>("#header"));
    private readonly footer = assertExists(this.root.querySelector<HTMLElement>("#footer"));
    private readonly bookTitle = assertExists(this.root.querySelector<HTMLElement>("#book-title"));
    private readonly chapterTitle = assertExists(this.root.querySelector<HTMLElement>("#chapter-title"));
    private readonly progressRate = assertExists(this.root.querySelector<HTMLElement>("#progress-rate"));
    private readonly readingStatus = assertExists(this.root.querySelector<HTMLElement>(".reading-status"));
    private readonly pagePosition = assertExists(this.root.querySelector<HTMLElement>("#page-position"));
    private readonly content = assertExists(this.root.querySelector<HTMLElement>("#content"));
    private readonly toolsEntry = assertExists(this.root.querySelector<HTMLButtonElement>("#reading-tools-entry"));
    private mobileControls = false;
    private toolsVisible = false;
    private cancelReadingGesture: (() => void) | undefined;

    /**
     * 翻页、目录、设置、全屏与书架入口在桌面侧栏和移动底部间复用原节点，保留事件与 Tab 顺序。
     * 移动工具默认收起；进入移动布局时保留正在使用的入口及浮层返回路径。
     */
    public bindResponsiveControls(signal: AbortSignal): void {
        this.renderFullscreenState();
        this.root.after(this.actions);
        signal.addEventListener(
            "abort",
            () => {
                this.actions.remove();
            },
            { once: true }
        );

        // 响应式切换只移动节点，不重建事件与展开状态。
        const mobile = window.matchMedia("(max-width: 800px), (pointer: coarse)");
        const toolbar = assertExists(this.root.querySelector<HTMLElement>(".mobile-actions"));
        const mobileNavigation = assertExists(this.root.querySelector<HTMLElement>(".mobile-page-navigation"));
        const location = assertExists(this.root.querySelector<HTMLElement>(".reading-location"));
        const navigation = assertExists(this.actions.querySelector<HTMLElement>(".navigation-actions"));
        const preferences = assertExists(this.actions.querySelector<HTMLElement>(".preference-actions"));
        const bookshelf = assertExists(this.actions.querySelector<HTMLElement>(".bookshelf-actions"));
        const controls = [
            { button: this.previousButton, desktopParent: navigation, mobileParent: mobileNavigation },
            { button: this.nextButton, desktopParent: navigation, mobileParent: mobileNavigation },
            { button: this.tocButton, desktopParent: navigation, mobileParent: toolbar },
            { button: this.settingButton, desktopParent: preferences, mobileParent: toolbar },
            { button: this.fullscreenButton, desktopParent: preferences, mobileParent: toolbar },
            { button: this.returnButton, desktopParent: bookshelf, mobileParent: toolbar },
        ];

        /**
         * 同步排布和焦点，仅在移动端需要接续操作时展开工具。
         */
        const sync = (): void => {
            // 布局切换后不沿用旧输入过程，即使同一次操作又切回原布局。
            if (this.mobileControls !== mobile.matches) this.cancelReadingGesture?.();
            const focused = document.activeElement;
            const focusedControl = focused instanceof HTMLElement && controls.some(({ button }) => button === focused);
            if (mobile.matches && !this.mobileControls && (focusedControl || this.hasOpenPanel())) {
                this.toolsVisible = true;
            }
            this.mobileControls = mobile.matches;
            this.root.toggleAttribute("data-mobile-controls", mobile.matches);
            this.actions.hidden = mobile.matches;
            this.toolsEntry.hidden = !mobile.matches;

            // 同步视觉位置与 DOM 顺序，让触摸排列和键盘遍历一致。
            for (const { button, desktopParent, mobileParent } of controls) {
                const parent = mobile.matches ? mobileParent : desktopParent;
                if (button.parentElement === parent) continue;
                if (mobile.matches && button === this.previousButton) parent.prepend(button);
                else parent.append(button);
            }

            // 页码和全书进度一起跟随工具区域，切换布局不重建阅读状态。
            const progressParent = mobile.matches ? location : this.actions;
            if (this.readingStatus.parentElement !== progressParent) progressParent.append(this.readingStatus);
            this.renderToolsVisibility();

            // 移动原按钮后恢复焦点，移动辅助入口退出布局时归还正文。
            if (focusedControl) {
                focused.focus({ preventScroll: true });
            } else if (focused === this.toolsEntry && !this.mobileControls) {
                this.content.focus({ preventScroll: true });
            }
        };

        // 响应式监听与辅助入口随页面清理，键盘打开工具后聚焦第一个操作入口。
        mobile.addEventListener("change", sync, { signal });
        bind(
            this.toolsEntry,
            "click",
            () => {
                if (!this.mobileControls || this.hasOpenPanel()) return;
                this.toolsVisible = !this.toolsVisible;
                this.renderToolsVisibility();
                if (this.toolsVisible) this.tocButton.focus({ preventScroll: true });
                else this.content.focus({ preventScroll: true });
            },
            { signal }
        );

        // 模态界面拥有自己的 Escape；只有阅读工具本身收起时才归还正文焦点。
        bind(
            document,
            "keydown",
            (event: KeyboardEvent) => {
                if (
                    event.key !== "Escape" ||
                    event.defaultPrevented ||
                    !this.mobileControls ||
                    !this.toolsVisible ||
                    this.hasOpenPanel()
                )
                    return;
                event.preventDefault();
                event.stopPropagation();
                this.hideReadingTools();
            },
            { signal }
        );

        // 初始化也使用同一投影流程，保证首次绘制前已同步显隐与可访问状态。
        sync();
    }

    /**
     * 阅读导航按当前模式前后翻页或逐屏滚动，目录和章节快捷键保留明确的跳章语义。
     */
    public renderNavigation({
        canPrevious,
        canNext,
        mode,
    }: {
        canPrevious: boolean;
        canNext: boolean;
        mode: ReadingMode;
    }): this {
        this.previousButton.disabled = !canPrevious;
        this.nextButton.disabled = !canNext;
        const unit = mode === "scroll" ? "屏" : "页";
        for (const [button, label] of [
            [this.previousButton, `上一${unit}`],
            [this.nextButton, `下一${unit}`],
        ] as const) {
            assertExists(button.querySelector("span:last-child")).textContent = label;
            button.setAttribute("aria-label", label);
            button.title = label;
        }
        this.pagePosition.hidden = mode === "scroll";
        return this;
    }

    /**
     * 页码只描述当前章节的排版结果；全书进度独立使用稳定内容位置。
     */
    public renderPageInfo(pageNumber: number, pageCount: number): void {
        assertExists(this.pagePosition.querySelector(".page-count")).textContent = `${pageNumber} / ${pageCount}`;
        this.pagePosition.setAttribute("aria-label", `本章第 ${pageNumber} 页，共 ${pageCount} 页`);
    }

    /**
     * 将按钮、正文键盘与有效手势统一为阅读意图，浮层打开时不接受背景导航。
     */
    public bindReadingNavigation(
        handlers: {
            onTurn: (direction: ReadingDirection) => Promise<void>;
            onChapter: (direction: ReadingDirection) => Promise<void>;
            onCenterTap: () => void;
            getMode: () => ReadingMode;
        },
        signal: AbortSignal
    ): this {
        /**
         * 所有翻页入口遵守同一浮层约束，业务层不依赖具体面板结构。
         */
        const navigate = async (direction: ReadingDirection): Promise<void> => {
            if (!this.hasOpenPanel()) await handlers.onTurn(direction);
        };
        bind(this.previousButton, "click", () => navigate(ReadingDirection.PREV), { signal });
        bind(this.nextButton, "click", () => navigate(ReadingDirection.NEXT), { signal });

        // 正文翻页与显式跳章分别处理，编辑、选区、输入法和长按重复保留原行为。
        bind(
            document,
            "keydown",
            async (event: KeyboardEvent) => {
                if (
                    event.defaultPrevented ||
                    event.altKey ||
                    event.metaKey ||
                    event.isComposing ||
                    event.repeat ||
                    window.getSelection()?.isCollapsed === false ||
                    this.hasOpenPanel()
                )
                    return;
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                if (target !== document.body && target !== this.content && !this.content.contains(target)) return;
                if (target.closest("button, a, input, textarea, select, summary, [contenteditable], [role=dialog]"))
                    return;
                if (event.ctrlKey) {
                    if (event.shiftKey || (event.key !== "PageUp" && event.key !== "PageDown")) return;
                    event.preventDefault();
                    await handlers.onChapter(event.key === "PageUp" ? ReadingDirection.PREV : ReadingDirection.NEXT);
                    return;
                }
                if (event.shiftKey && event.key !== " ") return;

                const direction =
                    event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)
                        ? ReadingDirection.PREV
                        : event.key === "ArrowRight" || event.key === "PageDown" || event.key === " "
                          ? ReadingDirection.NEXT
                          : ReadingDirection.INVALID;
                if (direction === ReadingDirection.INVALID) return;
                event.preventDefault();
                await navigate(direction);
            },
            { signal }
        );

        // 输入能力独立于工具布局：触摸大屏也可翻页，鼠标正文始终保留选择行为。
        this.cancelReadingGesture = bindReadingGestures(
            this.content,
            {
                isEnabled: () => !this.hasOpenPanel(),
                onTurn: navigate,
                onCenterTap: handlers.onCenterTap,
                getMode: handlers.getMode,
            },
            signal
        );
        return this;
    }

    /**
     * 切换移动端工具；浮层开启时保持入口状态，由浮层自身处理关闭和焦点恢复。
     */
    public toggleReadingTools(): void {
        if (!this.mobileControls || this.hasOpenPanel()) return;
        if (this.toolsVisible) this.hideReadingTools();
        else {
            this.toolsVisible = true;
            this.renderToolsVisibility();
        }
    }

    /**
     * 切章或显式关闭后回到沉浸正文；收起正在聚焦的工具时先归还正文焦点。
     */
    public hideReadingTools(): void {
        if (this.hasOpenPanel()) return;
        const focused = document.activeElement;
        if (this.header.contains(focused) || this.footer.contains(focused)) {
            this.content.focus({ preventScroll: true });
        }
        this.toolsVisible = false;
        this.renderToolsVisibility();
    }

    /**
     * 任意原生模态界面打开时，暂停背景切章、手势和工具显隐操作。
     */
    private hasOpenPanel(): boolean {
        return document.querySelector("dialog:modal") !== null;
    }

    /**
     * 隐藏工具同时移出焦点与辅助技术访问；工具以覆盖层显示，不改变正文尺寸。
     * 模态界面的背景限制由浏览器管理，不修改工具自身的隐藏状态。
     */
    private renderToolsVisibility(): void {
        // 视觉覆盖层与可访问状态使用同一结果，不能只隐藏按钮的像素。
        const hidden = !this.mobileControls || !this.toolsVisible;
        this.root.toggleAttribute("data-reading-tools-visible", !hidden);
        for (const region of [this.header, this.footer]) {
            if (hidden) region.setAttribute("aria-hidden", "true");
            else region.removeAttribute("aria-hidden");
            region.inert = this.mobileControls && hidden;
        }

        // 移动辅助入口描述下一步操作；桌面直接使用独立操作栏。
        const label = hidden ? "显示阅读工具" : "隐藏阅读工具";
        this.toolsEntry.setAttribute("aria-expanded", String(!hidden));
        this.toolsEntry.setAttribute("aria-label", label);
        this.toolsEntry.title = label;
        this.toolsEntry.textContent = label;
    }

    /**
     * 绑定返回入口，进度保存与路由切换由调用方处理。
     */
    public bindReturnToBookshelf(handler: () => Promise<void>, signal: AbortSignal): this {
        bind(this.returnButton, "click", handler, { signal });
        return this;
    }

    /**
     * 浏览器退出全屏时也同步当前控件状态。
     */
    public bindToggleFullscreen(handler: () => Promise<void>, signal: AbortSignal): this {
        bind(this.fullscreenButton, "click", handler, { signal });
        bind(
            document,
            "fullscreenchange",
            () => {
                this.renderFullscreenState();
            },
            { signal }
        );
        this.renderFullscreenState();
        return this;
    }

    /**
     * 绑定目录入口；位置改变不会重建按钮。
     */
    public bindToggleTocPanel(handler: () => void, signal: AbortSignal): this {
        bind(this.tocButton, "click", handler, { signal });
        return this;
    }

    /**
     * 同步目录入口的展开状态。
     */
    public setTocExpanded(expanded: boolean): this {
        this.tocButton.setAttribute("aria-expanded", String(expanded));
        return this;
    }

    /**
     * 将同一设置入口交给面板，以便关闭后恢复焦点。
     */
    public bindToggleSettingPanel(handler: (opener: HTMLButtonElement) => void, signal: AbortSignal): this {
        bind(
            this.settingButton,
            "click",
            (_, opener) => {
                handler(opener);
            },
            { signal }
        );
        return this;
    }

    /**
     * 按实际能力显示入口；主屏幕应用模式不等同于 Fullscreen API 状态。
     */
    private renderFullscreenState(): void {
        const fullscreen = Boolean(document.fullscreenElement);
        this.fullscreenButton.hidden =
            !fullscreen && (!document.fullscreenEnabled || typeof this.root.requestFullscreen !== "function");
        const label = fullscreen ? "退出全屏" : "进入全屏";
        this.fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
        this.fullscreenButton.setAttribute("aria-label", label);
        this.fullscreenButton.title = label;
    }

    /**
     * 显示书名，完整文件名保留为悬停提示。
     */
    public renderBookTitle(title: string): void {
        this.bookTitle.textContent = getBookTitle(title);
        this.bookTitle.title = title;
    }

    /**
     * 切章后同步章名与全书进度，显示节点可随桌面或移动布局移动。
     */
    public renderChapterInfo(title: string, bookPosition: number, positionCount: number): void {
        this.chapterTitle.textContent = title;
        this.chapterTitle.title = title;
        this.renderProgress(bookPosition, positionCount);
    }

    /**
     * 按全书稳定位置换算百分比，空书为零。
     */
    public renderProgress(bookPosition: number, positionCount: number): void {
        const ratio = positionCount === 0 ? 0 : Math.min(Math.max(bookPosition / positionCount, 0), 1);
        this.progressRate.textContent = `${(ratio * 100).toFixed(2)}%`;
    }
}
