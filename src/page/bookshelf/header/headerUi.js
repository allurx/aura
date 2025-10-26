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

/**
 * 书架头部界面
 * @author allurx
 */
export default class HeaderUi {

    /** @type {HTMLElement} */
    headerTitleElement;

    /** @type {HTMLElement} */
    clearBookshelfElement;

    constructor() {
        this.headerTitleElement = document.querySelector("#header-title");
        this.clearBookshelfElement = document.querySelector("#bookshelf-clear-btn");
    }

    /**
     * 绑定清空书架点击事件
     * @param {() => Promise<void>} handler - 处理函数
     * @returns {BookshelfUi} 返回当前实例
     */
    bindClearBookshelfClick(handler) {
        EventUtil.bind(this.clearBookshelfElement, "click", async (event, target) => await handler());
        return this;
    }

    /**
     * 绑定头部标题点击事件
     * @returns {BookshelfUi} 返回当前实例
     */
    bindHeaderTitleClick(handler) {
        EventUtil.bind(this.headerTitleElement, "click", (event, target) => handler());
        return this;
    }

}