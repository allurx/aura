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

import Book from "../../../domain/book/book.model";
import EventUtil from "../../../core/util/event.util";
import { assertExists } from "../../../core/util/assert.util";

/**
 * 书架主界面
 * @author allurx
 */
export default class MainUi {
    private readonly bookListElement: HTMLDivElement;
    private readonly bookInputElement: HTMLInputElement;

    public constructor() {
        this.bookListElement = assertExists(document.querySelector<HTMLDivElement>("#book-list"));
        this.bookInputElement = assertExists(document.querySelector<HTMLInputElement>("#book-input"));
    }

    /**
     * 创建书籍元素并添加到页面中
     * @param book - 书籍实例
     * @param index - 书籍索引
     * @returns  返回当前实例
     */
    public renderBookElement(book: Book, index: number) {
        this.bookListElement.insertAdjacentHTML("beforeend", book.template());
        const bookElement = this.bookListElement.lastElementChild;
        // 创建顺序延迟,形成"瀑布入场"动画效果
        window.setTimeout(() => bookElement?.classList.add("show"), index * 20);
        return this;
    }

    public renderBookElements(books: Book[]) {
        books
            .sort((a, b) => a.createdTime - b.createdTime)
            .forEach((book, index) => this.renderBookElement(book, index + 1));
        return this;
    }

    public removeBookElement(bookId: string) {
        const bookElement = this.bookListElement.querySelector<HTMLElement>(`.book[data-id="${bookId}"]`);
        bookElement?.remove();
        return this;
    }

    /**
     * 清空书籍列表元素
     * @returns 返回当前实例
     */
    public removeBookElements() {
        this.bookListElement.querySelectorAll(".book").forEach((element) => {
            element.remove();
        });
        return this;
    }

    /**
     * 清空书籍输入框, 以支持重复上传同一文件
     * @returns 返回当前实例
     */
    public clearBookInput() {
        this.bookInputElement.value = "";
        return this;
    }

    /**
     * 绑定书籍输入框变化事件
     * @param  handler - 处理函数
     * @returns 返回当前实例
     */
    public bindBookInputChange(handler: (files: FileList) => Promise<void>) {
        EventUtil.bind(this.bookInputElement, "change", async () => {
            await handler(assertExists(this.bookInputElement.files));
        });
        return this;
    }

    /**
     * 绑定书籍主体点击事件
     * @param handler - 处理函数
     * @returns 返回当前实例
     */
    public bindBookBodyClick(handler: (bookId: string) => void) {
        EventUtil.delegate(this.bookListElement, ".book-body", "click", (_, target) => {
            handler(assertExists(target.parentElement?.dataset["id"]));
        });
        return this;
    }

    /**
     * 绑定删除书籍点击事件
     * @param handler - 处理函数
     * @returns 返回当前实例
     */
    public bindDeleteBookClick(handler: (bookId: string) => Promise<void>) {
        EventUtil.delegate(this.bookListElement, ".book-delete-btn", "click", async (_, target) => {
            await handler(assertExists(target.closest<HTMLElement>(".book")?.dataset["id"]));
        });
        return this;
    }
}
