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

import Ui from "@/component/ui";
import { assertExists } from "@/util/assert-util";
import EventUtil from "@/util/event-util";
import tableOfContentsIcon from "@/asset/image/table-of-contents.svg";
import fullscreenIcon from "@/asset/image/fullscreen.svg";
import settingIcon from "@/asset/image/setting.svg";

/**
 * 阅读器头部界面
 * @author allurx
 */
export default class HeaderUi extends Ui {
    private readonly toggleTocPanelElement: HTMLImageElement;
    private readonly toggleFullscreenElement: HTMLImageElement;
    private readonly toggleSettingPanelElement: HTMLButtonElement;

    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.toggleTocPanelElement = assertExists(this.root.querySelector<HTMLImageElement>("#toggle-toc-panel"));
        this.toggleFullscreenElement = assertExists(this.root.querySelector<HTMLImageElement>("#toggle-fullscreen"));
        this.toggleSettingPanelElement = assertExists(
            this.root.querySelector<HTMLButtonElement>("#toggle-setting-panel")
        );
        this.toggleTocPanelElement.src = tableOfContentsIcon;
        this.toggleFullscreenElement.src = fullscreenIcon;
        assertExists(this.toggleSettingPanelElement.querySelector<HTMLImageElement>("img")).src = settingIcon;
    }

    /**
     * 绑定目录面板切换事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    public bindToggleTocPanel(handler: () => void, signal: AbortSignal): this {
        EventUtil.bind(this.toggleTocPanelElement, "click", handler, { signal });
        return this;
    }
    /**
     * 绑定全屏切换事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    public bindToggleFullscreen(handler: () => void, signal: AbortSignal): this {
        EventUtil.bind(this.toggleFullscreenElement, "click", handler, { signal });
        return this;
    }

    /**
     * 绑定设置面板切换事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    public bindToggleSettingPanel(handler: (opener: HTMLButtonElement) => void, signal: AbortSignal): this {
        EventUtil.bind(
            this.toggleSettingPanelElement,
            "click",
            (_, opener) => {
                handler(opener);
            },
            { signal }
        );
        return this;
    }
}
