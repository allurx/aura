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

import HeaderUi from "./header/header.ui";
import NavUi from "./nav/nav.ui";
import MainUi from "./body/body.ui";
import BookshelfUi from "./bookshelf.ui";
import BookshelfService from "./bookshelf.service";
import { assertExists } from "../../core/util/assert.util";

/**
 * 书架控制器
 * @author allurx
 */
export default class BookshelfController {
    private readonly header: HeaderUi;
    private readonly nav: NavUi;
    private readonly main: MainUi;
    private readonly bookshelf: BookshelfUi;
    private readonly bookshelfService: BookshelfService;

    // 当前选中的书籍分类id
    private categoryId!: string;

    public constructor() {
        this.header = new HeaderUi();
        this.nav = new NavUi();
        this.main = new MainUi();
        this.bookshelf = new BookshelfUi();
        this.bookshelfService = new BookshelfService();
    }

    public async init() {
        await this.bookshelfService.seedDatabase();
        const categories = await this.bookshelfService.getCategories();
        this.categoryId = assertExists(categories.find((category) => category.order === 1)).id;
        this.nav.renderNav(categories);
        this.bindEvent();
        this.nav.clickNavItem(this.categoryId);
    }

    /**
     * 阅读书籍
     * @param bookId - 书籍id
     */
    private readBook(bookId: string) {
        window.location.href = "../reader/reader.html";
        window.sessionStorage.setItem("bookId", bookId);
    }

    /**
     * 添加书籍
     * @param files - 书籍文件列表
     */
    private async addBook(files: FileList) {
        await this.bookshelf
            .showOverlayWhile(async () => {
                // 只处理文本文件
                const validFiles = Array.from(files).filter((file) => {
                    const isTextFile = file.type === "text/plain";
                    if (!isTextFile) void this.bookshelf.alertDialog(`${file.name}不是文本文件`);
                    return isTextFile;
                });
                await this.bookshelfService
                    .addBook(validFiles, this.categoryId)
                    .then((books) => this.main.renderBookElements(books));
            })
            .finally(() => this.main.clearBookInput());
    }

    /**
     * 删除书籍
     * @param bookId - 书籍id
     */
    private async deleteBook(bookId: string) {
        if (await this.bookshelf.confirmDialog("确定要删除这本书吗?")) {
            await this.bookshelf.showOverlayWhile(async () => {
                await this.bookshelfService.deleteBook(bookId).then(() => this.main.removeBookElement(bookId));
            });
        }
    }

    /**
     * 清空书架
     */
    private async clearBookshelf() {
        if (await this.bookshelf.confirmDialog("确定要清空书架中的所有书籍吗?")) {
            await this.bookshelf.showOverlayWhile(async () => {
                await this.bookshelfService.clearBookshelf().then(() => this.main.removeBookElements());
            });
        }
    }

    private bindEvent() {
        // 绑定头部事件
        this.header
            .bindClearBookshelfClick(() => this.clearBookshelf())
            .bindHeaderTitleClick(() => this.nav.toggleVisibility());

        // 绑定导航栏事件
        this.nav.delegateNavItemClick(async (categoryId) => {
            this.categoryId = categoryId;
            const books = await this.bookshelfService.getBooksByCategoryId(categoryId);
            this.main.removeBookElements();
            books.forEach((book, index) => this.main.renderBookElement(book, index));
        });

        // 绑定书籍主体事件
        this.main
            .bindBookInputChange((files) => this.addBook(files))
            .bindBookBodyClick((bookId) => {
                this.readBook(bookId);
            })
            .bindDeleteBookClick((bookId) => this.deleteBook(bookId));
    }
}
