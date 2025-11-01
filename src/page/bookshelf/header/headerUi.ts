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

import EventUtil from "../../../util/eventUtil.js";
import { assertExists } from "../../../util/assertUtil.js";

/**
 * 书架头部界面
 * @author allurx
 */
export default class HeaderUi {
    headerTitleElement: HTMLSpanElement;
    clearBookshelfElement: HTMLSpanElement;

    constructor() {
        this.headerTitleElement = assertExists(document.querySelector<HTMLSpanElement>("#header-title"));
        this.clearBookshelfElement = assertExists(
            document.querySelector<HTMLSpanElement>("#bookshelf-clear-btn")
        );
    }

    /**
     * 绑定清空书架点击事件
     * @param  handler - 处理函数
     * @returns  返回当前实例
     */
    bindClearBookshelfClick(handler: () => Promise<void>) {
        EventUtil.bind(this.clearBookshelfElement, "click", handler);
        return this;
    }   

    /**
     * 绑定头部标题点击事件
     * @returns 返回当前实例
     */
    bindHeaderTitleClick(handler: () => void) {
        EventUtil.bind(this.headerTitleElement, "click", handler);
        return this;
    }
}
