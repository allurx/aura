/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import { getBookTitle } from "@/domain/file/book-format";
import { assertExists } from "@/utils/assert-util";
import { bind } from "@/utils/event-util";
import type { ReadingDirection } from "./reading-direction";
import bindReadingInput from "./reading-input";
import type { ReadingMode } from "./reading-mode";
import ReaderTools, { type ReaderToolsBinding } from "./reader-tools";

export type { ReaderToolsBinding } from "./reader-tools";

/**
 * 阅读器工具分组、跨设备布局和移动沉浸状态。
 */
export default class ReaderUi extends Ui {
    private readonly actions = assertExists(this.root.querySelector<HTMLElement>("#reader-actions"));
    private readonly desktopTools = new ReaderTools(this.actions, this.root);
    private readonly returnButton = assertExists(this.root.querySelector<HTMLButtonElement>("#return-bookshelf"));
    public readonly tocButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-toc-panel"));
    public readonly settingButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-setting-panel"));
    private readonly fullscreenButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-fullscreen"));
    private readonly header = assertExists(this.root.querySelector<HTMLElement>("#header"));
    private readonly footer = assertExists(this.root.querySelector<HTMLElement>("#footer"));
    private readonly bookTitle = assertExists(this.root.querySelector<HTMLElement>("#book-title"));
    private readonly chapterTitle = assertExists(this.root.querySelector<HTMLElement>("#chapter-title"));
    private readonly progressRate = assertExists(this.root.querySelector<HTMLElement>("#progress-rate"));
    private readonly readingStatus = assertExists(this.root.querySelector<HTMLElement>(".reading-status"));
    private readonly pagePosition = assertExists(this.root.querySelector<HTMLElement>("#page-position"));
    private readonly currentPage = assertExists(this.pagePosition.querySelector<HTMLElement>(".current-page"));
    private readonly totalPages = assertExists(this.pagePosition.querySelector<HTMLElement>(".total-pages"));
    private readonly content = assertExists(this.root.querySelector<HTMLElement>("#content"));
    private readonly toolsEntry = assertExists(this.root.querySelector<HTMLButtonElement>("#reading-tools-entry"));
    private mobileControls = false;
    private toolsVisible = false;
    private cancelReadingGesture: (() => void) | undefined;

    /**
     * 首次异步加载正文前恢复工具栏外观，后续重置由设置控制器通知。
     */
    public bindToolsAppearance(binding: ReaderToolsBinding, signal: AbortSignal): void {
        this.desktopTools.bindAppearance(binding, signal);
    }

    /**
     * 目录、设置、书架与全屏入口在桌面侧栏和移动底部间复用原节点，保留事件与 Tab 顺序。
     * 移动工具默认收起；进入移动布局时保留正在使用的入口及浮层返回路径。
     */
    public bindResponsiveControls(signal: AbortSignal): void {
        let pendingFocus: { target: HTMLElement; previous: Element } | undefined;
        const focusObserver = new ResizeObserver(() => {
            const pending = pendingFocus;
            pendingFocus = undefined;
            focusObserver.disconnect();
            if (signal.aborted || !pending?.target.isConnected) return;
            if (document.activeElement === document.body || document.activeElement === pending.previous)
                pending.target.focus({ preventScroll: true });
        });
        this.renderFullscreenState();
        this.root.after(this.actions);
        this.desktopTools.bindControls(signal);
        signal.addEventListener(
            "abort",
            () => {
                focusObserver.disconnect();
                pendingFocus = undefined;
                this.actions.remove();
            },
            { once: true }
        );

        // 响应式切换只移动节点，不重建事件与展开状态。
        const mobile = window.matchMedia("(max-width: 800px), (pointer: coarse)");
        const toolbar = assertExists(this.root.querySelector<HTMLElement>(".mobile-actions"));
        const location = assertExists(this.root.querySelector<HTMLElement>(".reading-location"));
        const navigation = assertExists(this.actions.querySelector<HTMLElement>(".navigation-actions"));
        const pageActions = assertExists(this.actions.querySelector<HTMLElement>(".page-actions"));
        const controls = [
            { button: this.tocButton, desktopParent: navigation, mobileParent: toolbar },
            { button: this.settingButton, desktopParent: navigation, mobileParent: toolbar },
            { button: this.returnButton, desktopParent: pageActions, mobileParent: toolbar },
            { button: this.fullscreenButton, desktopParent: pageActions, mobileParent: toolbar },
        ];

        /**
         * 非原子移动丢失焦点时，等布局完成后恢复；用户已经选择的新焦点优先。
         */
        const restoreFocus = (target: HTMLElement, previous: Element): void => {
            pendingFocus = { target, previous };
            focusObserver.disconnect();
            focusObserver.observe(target);
        };

        /**
         * 同步排布和焦点，仅在移动端需要接续操作时展开工具。
         */
        const sync = (): void => {
            // 布局切换后不沿用旧输入过程，即使同一次操作又切回原布局。
            if (this.mobileControls !== mobile.matches) this.cancelReadingGesture?.();
            const focused = document.activeElement;
            const focusedControl = focused instanceof HTMLElement && controls.some(({ button }) => button === focused);
            const focusedDesktopTools = focused instanceof HTMLElement && this.actions.contains(focused);
            if (mobile.matches && !this.mobileControls && (focusedDesktopTools || this.hasOpenPanel())) {
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
                // 原子移动保留原生焦点，不在改变布局后再次 focus 触发正文同步重排。
                if (typeof parent.moveBefore === "function") parent.moveBefore(button, null);
                else parent.append(button);
            }

            // 页码和全书进度一起跟随工具区域，切换布局不重建阅读状态。
            const progressParent = mobile.matches ? location : this.desktopTools.body;
            if (this.readingStatus.parentElement !== progressParent) progressParent.append(this.readingStatus);
            this.desktopTools.setDesktop(!mobile.matches);
            this.renderToolsVisibility();

            // 移动原按钮后恢复焦点，移动辅助入口退出布局时归还正文。
            if (focusedControl) {
                const target = this.desktopTools.getFocusTarget(focused);
                if (document.activeElement !== target) restoreFocus(target, focused);
            } else if (focusedDesktopTools && this.mobileControls) {
                restoreFocus(this.tocButton, focused);
            } else if (focused === this.toolsEntry && !this.mobileControls) {
                restoreFocus(this.content, focused);
            }
        };

        // 响应式监听与辅助入口随页面清理，键盘打开工具后聚焦第一个操作入口。
        mobile.addEventListener("change", sync, { signal });
        for (const dialog of this.root.querySelectorAll<HTMLDialogElement>("dialog")) {
            bind(
                dialog,
                "close",
                () => {
                    if (dialog.returnValue !== "chapter-selected") this.desktopTools.restoreFocusAfterClose(dialog);
                },
                { signal }
            );
        }
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
     * 页码只用于分页阅读，连续滚动保留章节和全书进度。
     */
    public renderReadingMode(mode: ReadingMode): this {
        this.pagePosition.hidden = mode === "scroll";
        return this;
    }

    /**
     * 页码只描述当前章节的排版结果；全书进度独立使用稳定内容位置。
     */
    public renderPageInfo(pageNumber: number | undefined, pageCount: number | undefined): void {
        const current = pageNumber === undefined ? "—" : String(pageNumber);
        const total = pageCount === undefined ? "—" : String(pageCount);
        if (this.currentPage.textContent !== current) this.currentPage.textContent = current;
        if (this.totalPages.textContent !== total) this.totalPages.textContent = total;
        this.pagePosition.toggleAttribute("data-long-count", current.length + total.length > 6);
        this.pagePosition.toggleAttribute("data-wide-count", current.length + total.length > 8);
        this.pagePosition.setAttribute(
            "aria-label",
            pageNumber === undefined
                ? "正在计算本章页码"
                : pageCount === undefined
                  ? `本章第 ${pageNumber} 页，正在计算总页数`
                  : `本章第 ${pageNumber} 页，共 ${pageCount} 页`
        );
        this.pagePosition.setAttribute("aria-busy", String(pageNumber === undefined || pageCount === undefined));
    }

    /**
     * 正文和事件准备完成后启用相关操作；加载期间始终保留返回入口。
     */
    public enableReadingControls(): void {
        this.tocButton.disabled = false;
        this.settingButton.disabled = false;
        this.fullscreenButton.disabled = false;
    }

    /**
     * 正文键盘与有效手势统一为阅读意图，浮层打开时不接受背景导航。
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
        // 输入能力独立于工具布局：触摸大屏也可翻页，鼠标正文始终保留选择行为。
        this.cancelReadingGesture = bindReadingInput(
            this.content,
            {
                isEnabled: () => !this.hasOpenPanel(),
                onTurn: handlers.onTurn,
                onChapter: handlers.onChapter,
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
        else this.showReadingTools();
    }

    /**
     * 显式展开移动工具，初始化失败时也让已绑定的书架入口可达。
     */
    public showReadingTools(): void {
        this.toolsVisible = true;
        this.renderToolsVisibility();
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
     * 目录完成选章后接续正文，桌面和移动端共用同一个焦点落点。
     */
    public resumeReading(): void {
        if (this.hasOpenPanel()) return;
        this.content.focus({ preventScroll: true });
        this.hideReadingTools();
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
        if (this.chapterTitle.textContent !== title) this.chapterTitle.textContent = title;
        this.chapterTitle.title = title;
        this.renderProgress(bookPosition, positionCount);
    }

    /**
     * 按全书稳定位置换算百分比，空书为零。
     */
    public renderProgress(bookPosition: number, positionCount: number): void {
        const ratio = positionCount === 0 ? 0 : Math.min(Math.max(bookPosition / positionCount, 0), 1);
        const value = `${(ratio * 100).toFixed(2)}%`;
        if (this.progressRate.textContent !== value) this.progressRate.textContent = value;
    }
}
