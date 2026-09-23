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

import Ui from "@/components/ui";
import { assertExists } from "@/utils/assert-util";
import EventUtil from "@/utils/event-util";
import tableOfContentsIcon from "@/assets/images/table-of-contents.svg";
import fullscreenIcon from "@/assets/images/fullscreen.svg";
import settingIcon from "@/assets/images/setting.svg";

/**
 * 阅读器头部界面
 * @author allurx
 */
export default class HeaderUi extends Ui {
    private readonly tocToggleButton: HTMLButtonElement;
    private readonly fullscreenToggleButton: HTMLButtonElement;
    private readonly settingToggleButton: HTMLButtonElement;

    /** 通过打包资源设置遮罩，使图标继承页眉颜色并支持 portable 内联。 */
    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.tocToggleButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-toc-panel"));
        this.fullscreenToggleButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-fullscreen"));
        this.settingToggleButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-setting-panel"));
        this.tocToggleButton.style.setProperty("--icon-image", `url("${tableOfContentsIcon}")`);
        this.fullscreenToggleButton.style.setProperty("--icon-image", `url("${fullscreenIcon}")`);
        this.settingToggleButton.style.setProperty("--icon-image", `url("${settingIcon}")`);
    }

    /**
     * 绑定目录面板切换事件
     * @param handler - 事件处理函数
     * @param signal - 页面生命周期信号
     * @returns 当前实例
     */
    public bindToggleTocPanel(handler: () => void, signal: AbortSignal): this {
        EventUtil.bind(this.tocToggleButton, "click", handler, { signal });
        return this;
    }

    /**
     * 同步目录面板的展开状态。
     * @param expanded - 目录面板是否展开
     * @returns 当前实例
     */
    public setTocExpanded(expanded: boolean): this {
        this.tocToggleButton.setAttribute("aria-expanded", String(expanded));
        return this;
    }

    /**
     * 将焦点归还给目录切换按钮。
     * @returns 当前实例
     */
    public focusTocToggleButton(): this {
        this.tocToggleButton.focus();
        return this;
    }

    /**
     * 绑定全屏切换事件
     * @param handler - 事件处理函数
     * @param signal - 页面生命周期信号
     * @returns 当前实例
     */
    public bindToggleFullscreen(handler: () => void, signal: AbortSignal): this {
        EventUtil.bind(this.fullscreenToggleButton, "click", handler, { signal });
        return this;
    }

    /**
     * 绑定设置面板切换事件
     * @param handler - 事件处理函数
     * @param signal - 页面生命周期信号
     * @returns 当前实例
     */
    public bindToggleSettingPanel(handler: (opener: HTMLButtonElement) => void, signal: AbortSignal): this {
        EventUtil.bind(
            this.settingToggleButton,
            "click",
            (_, opener) => {
                handler(opener);
            },
            { signal }
        );
        return this;
    }
}
