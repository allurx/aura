/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import PageUi from "@/pages/page-ui";
import { assertExists } from "@/utils/assert-util";
import EventUtil from "@/utils/event-util";
import FullscreenUtil from "@/utils/fullscreen-util";

/**
 * 阅读器四键布局与移动端沉浸工具状态。
 * @author allurx
 */
export default class ReaderUi extends PageUi {
    private readonly returnButton = assertExists(this.root.querySelector<HTMLButtonElement>("#return-bookshelf"));
    private readonly tocButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-toc-panel"));
    private readonly settingButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-setting-panel"));
    private readonly fullscreenButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-fullscreen"));
    private readonly header = assertExists(this.root.querySelector<HTMLElement>("#header"));
    private readonly footer = assertExists(this.root.querySelector<HTMLElement>("#footer"));
    private readonly content = assertExists(this.root.querySelector<HTMLElement>("#content"));
    private readonly toolsEntry = assertExists(this.root.querySelector<HTMLButtonElement>("#reading-tools-entry"));
    private mobileControls = false;
    private toolsVisible = false;

    /**
     * 四键在桌面四角与移动端底部间移动原节点，保留事件、展开状态和自然 Tab 顺序。
     * 移动布局默认沉浸；已聚焦的工具或开启的浮层需要保留入口，不能随布局切换隐藏。
     */
    public bindResponsiveControls(signal: AbortSignal): void {
        // 保存四键的桌面归属，响应式切换只移动节点，不重建事件与展开状态。
        const mobile = window.matchMedia("(max-width: 800px), (pointer: coarse)");
        const toolbar = assertExists(this.root.querySelector<HTMLElement>(".mobile-actions"));
        const controls = [this.returnButton, this.tocButton, this.settingButton, this.fullscreenButton].map(
            (button) => ({
                button,
                desktopParent: assertExists(button.parentElement),
            })
        );

        /**
         * 仅进入移动布局时决定初始显隐，保持同一布局内已有的工具状态。
         */
        const sync = (): void => {
            // 进入沉浸布局时保留正在使用的入口，普通首次进入则隐藏工具。
            const focused = document.activeElement;
            const focusedControl = focused instanceof HTMLElement && controls.some(({ button }) => button === focused);
            if (mobile.matches && !this.mobileControls) this.toolsVisible = focusedControl || this.hasOpenPanel();
            this.mobileControls = mobile.matches;
            this.root.toggleAttribute("data-mobile-controls", mobile.matches);

            // 同步视觉位置与 DOM 顺序，让触摸排列和键盘遍历一致。
            for (const { button, desktopParent } of controls) {
                const parent = mobile.matches ? toolbar : desktopParent;
                if (button.parentElement !== parent) parent.append(button);
            }
            this.renderToolsVisibility();

            // 移动聚焦节点后恢复焦点；桌面不再提供沉浸入口时回到正文。
            if (focusedControl && (!this.mobileControls || this.toolsVisible)) {
                focused.focus({ preventScroll: true });
            } else if (focused === this.toolsEntry && !this.mobileControls) {
                this.content.focus({ preventScroll: true });
            }
        };

        // 响应式监听与辅助入口随页面清理，键盘打开工具后直接进入四键操作。
        mobile.addEventListener("change", sync, { signal });
        EventUtil.bind(
            this.toolsEntry,
            "click",
            () => {
                if (!this.mobileControls || this.hasOpenPanel()) return;
                this.toolsVisible = !this.toolsVisible;
                this.renderToolsVisibility();
                if (this.toolsVisible) this.returnButton.focus({ preventScroll: true });
                else this.content.focus({ preventScroll: true });
            },
            { signal }
        );

        // 模态界面拥有自己的 Escape；只有阅读工具本身收起时才归还正文焦点。
        EventUtil.bind(
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
                const focused = document.activeElement;
                const restoreContentFocus = this.header.contains(focused) || this.footer.contains(focused);
                event.preventDefault();
                event.stopPropagation();
                this.hideReadingTools();
                if (restoreContentFocus) this.content.focus({ preventScroll: true });
            },
            { signal }
        );

        // 初始化也使用同一投影流程，保证首次绘制前已同步显隐与可访问状态。
        sync();
    }

    /**
     * 切换移动端工具；浮层开启时保持入口状态，由浮层自身处理关闭和焦点恢复。
     * @returns 是否消费中心轻点；移动端即使未切换工具，也不能继续解释为切章。
     */
    public toggleReadingTools(): boolean {
        if (!this.mobileControls) return false;
        if (!this.hasOpenPanel()) {
            this.toolsVisible = !this.toolsVisible;
            this.renderToolsVisibility();
        }
        return true;
    }

    /**
     * 切章后回到沉浸正文，不主动把键盘焦点移到别处。
     */
    public hideReadingTools(): void {
        if (!this.mobileControls || this.hasOpenPanel()) return;
        this.toolsVisible = false;
        this.renderToolsVisibility();
    }

    /**
     * 全局原生模态弹窗及本页外观面板优先处理 Escape，沉浸工具不能同时收起。
     */
    private hasOpenPanel(): boolean {
        return this.root.querySelector("#setting.open") !== null || document.querySelector("dialog:modal") !== null;
    }

    /**
     * 隐藏工具同时移出焦点与辅助技术访问；工具以覆盖层显示，不改变正文尺寸。
     * 外观面板负责保存并恢复显式 inert，原生模态的背景限制则由浏览器管理。
     */
    private renderToolsVisibility(): void {
        // 视觉覆盖层与可访问状态使用同一结果，不能只隐藏按钮的像素。
        const hidden = this.mobileControls && !this.toolsVisible;
        const appearanceOpen = this.root.querySelector("#setting.open") !== null;
        this.root.toggleAttribute("data-reading-tools-visible", this.mobileControls && this.toolsVisible);
        for (const region of [this.header, this.footer]) {
            if (hidden) region.setAttribute("aria-hidden", "true");
            else region.removeAttribute("aria-hidden");
            if (!appearanceOpen) region.inert = hidden;
        }

        // 辅助入口始终描述下一次操作，桌面布局不需要额外的工具开关。
        this.toolsEntry.hidden = !this.mobileControls;
        this.toolsEntry.setAttribute("aria-expanded", String(!hidden));
        this.toolsEntry.textContent = hidden ? "显示阅读工具" : "隐藏阅读工具";
    }

    /**
     * 保存进度后返回书架。
     */
    public bindReturnToBookshelf(handler: () => Promise<void>, signal: AbortSignal): this {
        EventUtil.bind(this.returnButton, "click", handler, { signal });
        return this;
    }

    /**
     * 浏览器退出全屏时也同步当前控件状态。
     */
    public bindToggleFullscreen(handler: () => Promise<void>, signal: AbortSignal): this {
        EventUtil.bind(this.fullscreenButton, "click", handler, { signal });
        EventUtil.bind(
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
        EventUtil.bind(this.tocButton, "click", handler, { signal });
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
        EventUtil.bind(
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
     * 以浏览器实际全屏状态更新提示。
     */
    private renderFullscreenState(): void {
        const fullscreen = FullscreenUtil.isActive();
        const label = fullscreen ? "退出全屏" : "进入全屏";
        this.fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
        this.fullscreenButton.setAttribute("aria-label", label);
        this.fullscreenButton.title = label;
    }
}
