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

import EventUtil from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import bookshelfClearIcon from "@/assets/images/bookshelf-clear.svg";
import settingIcon from "@/assets/images/setting.svg";
import Ui from "@/components/ui";

/**
 * 书架头部界面
 * @author allurx
 */
export default class HeaderUi extends Ui {
    private readonly headerTitleElement: HTMLSpanElement;
    private readonly settingToggleButton: HTMLButtonElement;
    private readonly clearBookshelfButton: HTMLButtonElement;

    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.headerTitleElement = assertExists(this.root.querySelector<HTMLSpanElement>("#title"));
        this.settingToggleButton = assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-setting-panel"));
        this.clearBookshelfButton = assertExists(this.root.querySelector<HTMLButtonElement>("#clear-btn"));
        assertExists(this.settingToggleButton.querySelector<HTMLImageElement>("img")).src = settingIcon;
        assertExists(this.clearBookshelfButton.querySelector<HTMLImageElement>("img")).src = bookshelfClearIcon;
    }

    /**
     * 绑定设置面板切换事件
     * @param handler - 处理函数
     * @param signal - 页面生命周期信号
     * @returns 返回当前实例
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

    /**
     * 绑定清空书架点击事件
     * @param  handler - 处理函数
     * @returns  返回当前实例
     * @param signal - 页面生命周期信号
     */
    public bindClearBookshelfClick(handler: () => Promise<void>, signal: AbortSignal): this {
        EventUtil.bind(this.clearBookshelfButton, "click", handler, { signal });
        return this;
    }

    /**
     * 绑定头部标题点击事件
     * @returns 返回当前实例
     * @param handler - 处理函数
     * @param signal - 页面生命周期信号
     */
    public bindHeaderTitleClick(handler: () => void, signal: AbortSignal): this {
        EventUtil.bind(this.headerTitleElement, "click", handler, { signal });
        return this;
    }
}
