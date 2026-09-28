/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import Overlay from "@/components/overlay/overlay";
import { assertExists } from "@/utils/assert-util";
import { bind } from "@/utils/event-util";
import { SwitchChapterDirection } from "./switch-chapter-direction";

/**
 * 阅读器工具分组、跨设备布局和移动沉浸状态。
 */
export default class ReaderUi extends Ui {
    public readonly overlay = new Overlay(this.root);
    private readonly actions = assertExists(this.root.querySelector<HTMLElement>("#reader-actions"));
    private readonly previousButton = assertExists(this.actions.querySelector<HTMLButtonElement>("#previous-chapter"));
    private readonly nextButton = assertExists(this.actions.querySelector<HTMLButtonElement>("#next-chapter"));
    private readonly returnButton = assertExists(this.root.querySelector<HTMLButtonElement>("#return-bookshelf"));
    private readonly tocButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-toc-panel"));
    private readonly settingButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-setting-panel"));
    private readonly fullscreenButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-fullscreen"));
    private readonly header = assertExists(this.root.querySelector<HTMLElement>("#header"));
    private readonly footer = assertExists(this.root.querySelector<HTMLElement>("#footer"));
    private readonly bookTitle = assertExists(this.root.querySelector<HTMLElement>("#book-title"));
    private readonly chapterTitle = assertExists(this.root.querySelector<HTMLElement>("#chapter-title"));
    private readonly progressRate = assertExists(this.root.querySelector<HTMLElement>("#progress-rate"));
    private readonly content = assertExists(this.root.querySelector<HTMLElement>("#content"));
    private readonly toolsEntry = assertExists(this.root.querySelector<HTMLButtonElement>("#reading-tools-entry"));
    private mobileControls = false;
    private toolsVisible = false;

    /**
     * 四键在桌面外侧栏与移动端底部间移动原节点，保留事件、展开状态和自然 Tab 顺序。
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
        const location = assertExists(this.root.querySelector<HTMLElement>(".reading-location"));
        const navigation = assertExists(this.actions.querySelector<HTMLElement>(".navigation-actions"));
        const preferences = assertExists(this.actions.querySelector<HTMLElement>(".preference-actions"));
        const bookshelf = assertExists(this.actions.querySelector<HTMLElement>(".bookshelf-actions"));
        const controls = [
            { button: this.tocButton, desktopParent: navigation },
            { button: this.settingButton, desktopParent: preferences },
            { button: this.fullscreenButton, desktopParent: preferences },
            { button: this.returnButton, desktopParent: bookshelf },
        ];

        /**
         * 同步排布和焦点，仅在移动端需要接续操作时展开工具。
         */
        const sync = (): void => {
            const focused = document.activeElement;
            const focusedControl = focused instanceof HTMLElement && controls.some(({ button }) => button === focused);
            const focusedChapter = focused === this.previousButton || focused === this.nextButton;
            if (mobile.matches && !this.mobileControls && (focusedControl || this.hasOpenPanel())) {
                this.toolsVisible = true;
            }
            this.mobileControls = mobile.matches;
            this.root.toggleAttribute("data-mobile-controls", mobile.matches);
            this.actions.hidden = mobile.matches;
            this.toolsEntry.hidden = !mobile.matches;

            // 同步视觉位置与 DOM 顺序，让触摸排列和键盘遍历一致。
            for (const { button, desktopParent } of controls) {
                const parent = mobile.matches ? toolbar : desktopParent;
                if (button.parentElement !== parent) parent.append(button);
            }

            // 同一进度节点跟随工具区域，显示内容不随布局分叉。
            const progressParent = mobile.matches ? location : this.actions;
            if (this.progressRate.parentElement !== progressParent) progressParent.append(this.progressRate);
            this.renderToolsVisibility();

            // 移动原按钮后恢复焦点，移动辅助入口退出布局时归还正文。
            if (focusedControl) {
                focused.focus({ preventScroll: true });
            } else if (
                (focused === this.toolsEntry && !this.mobileControls) ||
                (focusedChapter && this.mobileControls)
            ) {
                this.content.focus({ preventScroll: true });
            }
        };

        // 响应式监听与辅助入口随页面清理，键盘打开工具后直接进入四键操作。
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
     * 桌面切章按钮显示边界状态，移动端通过正文手势或目录切章。
     */
    public renderChapterNavigation(chapterNumber: number, chapterCount: number): this {
        this.previousButton.disabled = chapterNumber <= 1;
        this.nextButton.disabled = chapterNumber >= chapterCount;
        return this;
    }

    /**
     * 显式切章入口与手势、键盘复用同一业务处理器。
     */
    public bindChapterNavigation(
        handler: (direction: SwitchChapterDirection) => Promise<void>,
        signal: AbortSignal
    ): this {
        bind(this.previousButton, "click", () => handler(SwitchChapterDirection.PREV), { signal });
        bind(this.nextButton, "click", () => handler(SwitchChapterDirection.NEXT), { signal });
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
     * 原生模态界面优先处理 Escape，沉浸工具不能同时收起。
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
     * 保存进度后返回书架。
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
     * 将同一外观入口交给面板，以便关闭后恢复焦点。
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
        this.bookTitle.textContent = title.replace(/\.txt$/i, "");
        this.bookTitle.title = title;
    }

    /**
     * 切章后同步章名与全书进度，显示节点可随桌面或移动布局移动。
     */
    public renderChapterInfo(title: string, bookLineNumber: number, numberOfLines: number): void {
        this.chapterTitle.textContent = title;
        this.chapterTitle.title = title;
        this.renderProgress(bookLineNumber, numberOfLines);
    }

    /**
     * 全书物理行号换算为百分比，空书为零。
     */
    public renderProgress(bookLineNumber: number, numberOfLines: number): void {
        const ratio = numberOfLines === 0 ? 0 : Math.min(Math.max(bookLineNumber / numberOfLines, 0), 1);
        this.progressRate.textContent = `${(ratio * 100).toFixed(2)}%`;
    }
}
