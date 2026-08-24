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
import BookshelfUi from "./bookshelf-ui";
import BookshelfService from "./bookshelf-service";
import BookshelfState from "./bookshelf-state";

/**
 * 书架控制器
 * @author allurx
 */
export default class BookshelfController {
    private readonly headerUi: HeaderUi;
    private readonly navUi: NavUi;
    private readonly bookListUi: BookListUi;
    private readonly bookshelfUi: BookshelfUi;
    private readonly bookshelfService: BookshelfService;
    private state!: BookshelfState;

    public constructor(
        bookshelfRoot: HTMLElement,
        private readonly onReadBook: (bookId: string) => void
    ) {
        this.headerUi = new HeaderUi(bookshelfRoot);
        this.navUi = new NavUi(bookshelfRoot);
        this.bookListUi = new BookListUi(bookshelfRoot);
        this.bookshelfUi = new BookshelfUi(bookshelfRoot);
        this.bookshelfService = new BookshelfService();
    }

    public async init(signal: AbortSignal): Promise<void> {
        const state = await this.bookshelfService.init();
        if (signal.aborted) return;

        this.state = state;
        this.navUi.renderNav(this.state.categories);
        this.bindEvent(signal);
        this.navUi.clickNavItem(this.state.categoryId);
    }

    /**
     * 阅读书籍
     * @param bookId - 书籍id
     */
    private readBook(bookId: string): void {
        this.onReadBook(bookId);
    }

    /**
     * 添加书籍
     * @param files - 书籍文件列表
     */
    private async addBook(files: File[]) {
        await this.bookshelfUi
            .showOverlayWhile(async () => {
                // 只处理文本文件
                await this.bookshelfService
                    .addBook(
                        files.filter((file) => {
                            if (file.type === "text/plain") return true;
                            void this.bookshelfUi.alertDialog(`${file.name}不是文本文件`);
                            return false;
                        }),
                        this.state.categoryId,
                        true
                    )
                    .then(async ({ books, duplicateFiles }) => {
                        this.bookListUi.renderBookElements(books);
                        if (duplicateFiles.length > 0) {
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

    private bindEvent(signal: AbortSignal): void {
        // 绑定头部事件
        this.headerUi
            .bindClearBookshelfClick(() => this.clearBookshelf(), signal)
            .bindHeaderTitleClick(() => this.navUi.toggleVisibility(), signal);

        // 绑定导航栏事件
        this.navUi.delegateNavItemClick(async (categoryId) => {
            this.state.categoryId = categoryId;
            await this.bookshelfService
                .getBooksByCategoryId(categoryId)
                .then((books) => this.bookListUi.removeBookElements().renderBookElements(books));
        }, signal);

        // 绑定书籍主体事件
        this.bookListUi
            .bindBookInputChange((files) => this.addBook(files), signal)
            .bindBookBodyClick((bookId) => {
                this.readBook(bookId);
            }, signal)
            .bindDeleteBookClick((bookId) => this.deleteBook(bookId), signal);
    }
}
