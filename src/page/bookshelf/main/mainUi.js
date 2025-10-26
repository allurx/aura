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
 * 书架主界面
 * @author allurx
 */
export default class MainUi {

    /** @type {HTMLElement} */
    bookListElement;

    /** @type {HTMLInputElement} */
    bookInputElement;

    constructor() {
        this.bookListElement = document.querySelector("#book-list");
        this.bookInputElement = document.querySelector("#book-input");
    }

    /**
     * 创建书籍元素并添加到页面中
     * @param {Book} book - 书籍实例
     * @returns {MainUi} 返回当前实例
     */
    renderBookElement(book, index) {
        this.bookListElement.insertAdjacentHTML("beforeend", book.template());
        const bookElement = this.bookListElement.lastElementChild;
        // 创建顺序延迟,形成"瀑布入场"动画效果
        setTimeout(() => bookElement.classList.add("show"), (index ?? 1) * 20);
        return this;
    }

    /**
     * 清空书籍输入框, 以支持重复上传同一文件
     * @returns {MainUi} 返回当前实例
     */
    clearBookInput() {
        this.bookInputElement.value = "";
        return this;
    }

    /**
     * 清空书籍列表元素
     * @returns {MainUi} 返回当前实例
     */
    removeBookElements() {
        this.bookListElement.querySelectorAll(".book").forEach(element => element.remove());
        return this;
    }

    /** 
     * 绑定书籍输入框变化事件
     * @param {(files: FileList) => Promise<void>} handler - 处理函数
     * @returns {MainUi} 返回当前实例
     */
    bindBookInputChange(handler) {
        EventUtil.bind(this.bookInputElement, "change", async (event, target) => await handler(this.bookInputElement.files));
        return this;
    }

    /** 
     * 绑定书籍主体点击事件
     * @param {(bookId: number) => void} handler - 处理函数
     * @returns {MainUi} 返回当前实例
     */
    bindBookBodyClick(handler) {
        EventUtil.delegate(this.bookListElement, ".book-body", "click", (event, target) => handler(target.parentElement.dataset.id));
        return this;
    }

    /** 
     * 绑定删除书籍点击事件
     * @param {(bookId: number) => Promise<void>} handler - 处理函数
     * @returns {MainUi} 返回当前实例
     */
    bindDeleteBookClick(handler) {
        EventUtil.delegate(this.bookListElement, ".book-delete-btn", "click", async (event, target) => await handler(target.closest(".book").dataset.id));
        return this;
    }

}