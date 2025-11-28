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

import HeaderUi from "./header/header-ui";
import NavUi from "./nav/nav-ui";
import BookListUi from "./book-list/book-list-ui";
import BodyUi from "./body/body-ui";
import BookshelfService from "./bookshelf-service";
import BookshelfState from "./bookshelf-state";
import ArrayUtil from "../../util/array-util";

/**
 * 书架控制器
 * @author allurx
 */
export default class BookshelfController {
    private readonly headerUi: HeaderUi;
    private readonly navUi: NavUi;
    private readonly bookListUi: BookListUi;
    private readonly bookshelfUi: BodyUi;
    private readonly bookshelfService: BookshelfService;
    private state!: BookshelfState;

    public constructor() {
        this.headerUi = new HeaderUi();
        this.navUi = new NavUi();
        this.bookListUi = new BookListUi();
        this.bookshelfUi = new BodyUi();
        this.bookshelfService = new BookshelfService();
    }

    public async init() {
        this.state = await this.bookshelfService.init();
        this.navUi.renderNav(this.state.categories);
        this.bindEvent();
        this.navUi.clickNavItem(this.state.categoryId);
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
    private async addBook(files: File[]) {
        await this.bookshelfUi
            .showOverlayWhile(async () => {
                // 只处理文本文件
                const validFiles = Array.from(files).filter((file) => {
                    const isTextFile = file.type === "text/plain";
                    if (!isTextFile) void this.bookshelfUi.alertDialog(`${file.name}不是文本文件`);
                    return isTextFile;
                });
                await this.bookshelfService
                    .addBook(validFiles, this.state.categoryId, true)
                    .then(async ({ books, duplicateFiles }) => {
                        this.bookListUi.renderBookElements(books);
                        if (ArrayUtil.isNotEmpty(duplicateFiles)) {
                            await this.bookshelfUi.alertDialog(
                                `${duplicateFiles.map((file) => file.name).join(", ")}已存在`
                            );
                        }
                    });
            })
            .finally(() => this.bookListUi.clearBookInput());
    }

    /**
     * 删除书籍
     * @param bookId - 书籍id
     */
    private async deleteBook(bookId: string) {
        if (await this.bookshelfUi.confirmDialog("确定要删除这本书吗?")) {
            await this.bookshelfUi.showOverlayWhile(async () => {
                await this.bookshelfService.deleteBook(bookId).then(() => this.bookListUi.removeBookElement(bookId));
            });
        }
    }

    /**
     * 清空书架
     */
    private async clearBookshelf() {
        if (await this.bookshelfUi.confirmDialog("确定要清空书架中的所有书籍吗?")) {
            await this.bookshelfUi.showOverlayWhile(async () => {
                await this.bookshelfService.clearBookshelf().then(() => this.bookListUi.removeBookElements());
            });
        }
    }

    private bindEvent() {
        // 绑定头部事件
        this.headerUi
            .bindClearBookshelfClick(() => this.clearBookshelf())
            .bindHeaderTitleClick(() => this.navUi.toggleVisibility());

        // 绑定导航栏事件
        this.navUi.delegateNavItemClick(async (categoryId) => {
            this.state.categoryId = categoryId;
            const books = await this.bookshelfService.getBooksByCategoryId(categoryId);
            this.bookListUi.removeBookElements().renderBookElements(books);
        });

        // 绑定书籍主体事件
        this.bookListUi
            .bindBookInputChange((files) => this.addBook(files))
            .bindBookBodyClick((bookId) => {
                this.readBook(bookId);
            })
            .bindDeleteBookClick((bookId) => this.deleteBook(bookId));
    }
}
