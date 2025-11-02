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

import HeaderUi from "./header/headerUi.js";
import NavUi from "./nav/navUi.js";
import MainUi from "./main/mainUi.js";
import BookshelfUi from "./bookshelfUi.js";
import BookshelfService from "../../service/bookshelfService.js";

/**
 * 书架控制器
 * @author allurx
 */
export default class BookshelfController {
    headerUi: HeaderUi;
    navUi: NavUi;
    mainUi: MainUi;
    bookshelfUi: BookshelfUi;
    bookshelfService: BookshelfService;

    // 当前选中的书籍分类id
    genreId = 1;

    constructor() {
        this.headerUi = new HeaderUi();
        this.navUi = new NavUi();
        this.mainUi = new MainUi();
        this.bookshelfUi = new BookshelfUi();
        this.bookshelfService = new BookshelfService();
    }

    init() {
        this.navUi.renderNav();
        this.bindEvent();
        this.navUi.dispatchNavItemClick(this.genreId);
    }

    /**
     * 阅读书籍
     * @param bookId - 书籍id
     */
    readBook(bookId: string) {
        window.location.href = "../reader/reader.html";
        window.sessionStorage.setItem("bookId", bookId);
    }

    /**
     * 添加书籍
     * @param files - 书籍文件列表
     */
    async addBook(files: FileList) {
        await this.bookshelfUi
            .showOverlayWhile(async () => {
                // 只处理文本文件
                const validFiles = Array.from(files).filter((file) => {
                    const isTextFile = file.type === "text/plain";
                    if (!isTextFile) void this.bookshelfUi.alertDialog(`${file.name}不是文本文件`);
                    return isTextFile;
                });
                await this.bookshelfService.addBook(validFiles, this.genreId, (book, index) => {
                    this.mainUi.renderBookElement(book, index);
                });
            })
            .finally(() => this.mainUi.clearBookInput());
    }

    /**
     * 删除书籍
     * @param bookId - 书籍id
     */
    async deleteBook(bookId: string) {
        if (await this.bookshelfUi.confirmDialog("确定要删除这本书吗?")) {
            await this.bookshelfUi.showOverlayWhile(async () => {
                await this.bookshelfService
                    .deleteBook(bookId)
                    .then(() => this.navUi.dispatchNavItemClick(this.genreId));
            });
        }
    }

    /**
     * 清空书架
     */
    async clearBookshelf() {
        if (await this.bookshelfUi.confirmDialog("确定要清空书架中的所有书籍吗?")) {
            await this.bookshelfUi.showOverlayWhile(async () => {
                await this.bookshelfService.clearBookshelf().then(() => this.navUi.dispatchNavItemClick(this.genreId));
            });
        }
    }

    bindEvent() {
        // 绑定头部事件
        this.headerUi
            .bindClearBookshelfClick(() => this.clearBookshelf())
            .bindHeaderTitleClick(() => this.navUi.toggleVisibility());

        // 绑定导航栏事件
        this.navUi.bindNavItemClick(async (genreId) => {
            this.genreId = genreId;
            this.mainUi.removeBookElements();
            await this.bookshelfService.clickNavItem(genreId, (book, index) => {
                this.mainUi.renderBookElement(book, index);
            });
        });

        // 绑定书籍主体事件
        this.mainUi
            .bindBookInputChange((files) => this.addBook(files))
            .bindBookBodyClick((bookId) => {
                this.readBook(bookId);
            })
            .bindDeleteBookClick((bookId) => this.deleteBook(bookId));
    }
}
