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
import FileService from "../../service/fileService.js";
import BookService from "../../service/bookService.js";
import ChapterService from "../../service/chapterService.js";
import ReadingProgressService from "../../service/readingProgressService.js";
import ReaderSettingService from "../../service/readerSettingService.js";
import TableOfContentsService from "../../service/tableOfContentsService.js";
import Book from "../../model/book.js";
import BookFile from "../../model/bookFile.js";
import TableOfContents from "../../model/tableOfContents.js";
import ReadingProgress from "../../model/readingProgress.js";
import TransactionManager from "../../core/database/transactionManager.js";
import FileUtil from "../../util/fileUtil.js";
import {
    fileStore,
    bookStore,
    tableOfContentsStore,
    chapterStore,
    readingProgressStore,
} from "../../core/database/DatabaseDefinition.js";
import { NonEmptyArray } from "../../type/type.js";
import AssertUtil from "../../util/assertUtil.js";

/**
 * 书架控制器
 * @author allurx
 */
export default class BookshelfController {
    headerUi: HeaderUi;
    navUi: NavUi;
    mainUi: MainUi;
    bookshelfUi: BookshelfUi;
    fileService: FileService;
    bookService: BookService;
    chapterService: ChapterService;
    readingProgressService: ReadingProgressService;
    readerSettingService: ReaderSettingService;
    tableOfContentsService: TableOfContentsService;

    // 当前选中的书籍分类id
    genreId: number;

    constructor() {
        this.headerUi = new HeaderUi();
        this.navUi = new NavUi();
        this.mainUi = new MainUi();
        this.bookshelfUi = new BookshelfUi();
        this.fileService = new FileService();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.readingProgressService = new ReadingProgressService();
        this.readerSettingService = new ReaderSettingService();
        this.tableOfContentsService = new TableOfContentsService();
        this.genreId = 1;
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
                // 在事务外部执行异步函数汇总数据以避免事务被浏览器提前提交
                const groupedData = await this.#groupFilesByHash(files);

                await TransactionManager.runTransaction(
                    [
                        fileStore.name,
                        bookStore.name,
                        chapterStore.name,
                        tableOfContentsStore.name,
                        readingProgressStore.name,
                    ],
                    "readwrite",
                    async (transaction) => {
                        await Promise.all(
                            groupedData.map(async ({ hash, bookFile, chapters, tableOfContents, books }) => {
                                console.log(`Processing file with hash: ${hash}`);

                                // 保存分组下的书籍文件、章节和目录
                                await this.fileService.save(bookFile, transaction);
                                await this.chapterService.save(chapters, transaction);
                                await this.tableOfContentsService.save(tableOfContents, transaction);

                                // 保存分组下的所有书籍和阅读进度
                                const bookPromises = books.map(async ({ book, readingProgress }) => {
                                    // 保存书籍
                                    await this.bookService.save(book, transaction);

                                    // 保存阅读进度
                                    await this.readingProgressService.save(readingProgress, transaction);

                                    // 创建书籍元素
                                    this.mainUi.renderBookElement(book, 1);
                                });

                                await Promise.all(bookPromises);
                            })
                        );
                    }
                );
            })
            .finally(() => this.mainUi.clearBookInput());
    }

    /**
     * 清空书架
     */
    async clearBookshelf() {
        if (await this.bookshelfUi.confirmDialog("确定要清空书架中的所有书籍吗?")) {
            await this.bookshelfUi.showOverlayWhile(async () => {
                await TransactionManager.runTransaction(
                    [
                        fileStore.name,
                        bookStore.name,
                        chapterStore.name,
                        tableOfContentsStore.name,
                        readingProgressStore.name,
                    ],
                    "readwrite",
                    async (transaction) =>
                        await Promise.all([
                            this.fileService.clear(transaction),
                            this.bookService.clear(transaction),
                            this.chapterService.clear(transaction),
                            this.tableOfContentsService.clear(transaction),
                            this.readingProgressService.clear(transaction),
                        ])
                ).then(() => this.navUi.dispatchNavItemClick(this.genreId));
            });
        }
    }

    /**
     * 删除书籍
     * @param bookId - 书籍id
     */
    async deleteBook(bookId: string) {
        if (await this.bookshelfUi.confirmDialog("确定要删除这本书吗?")) {
            await this.bookshelfUi.showOverlayWhile(async () => {
                await TransactionManager.runTransaction(
                    [
                        fileStore.name,
                        bookStore.name,
                        chapterStore.name,
                        tableOfContentsStore.name,
                        readingProgressStore.name,
                    ],
                    "readwrite",
                    async (transaction) => {
                        // 如果该文件没有其他书籍则删除对应的file, chapter和tableOfContents
                        const book = AssertUtil.assertExists(
                            await this.bookService.getById(bookId, transaction),
                            `Book[${bookId}] not found`
                        );
                        const count = await this.bookService.countByFileId(book.fileId, transaction);

                        if (count <= 1)
                            await Promise.all([
                                this.fileService.deleteById(book.fileId, transaction),
                                this.chapterService.deleteByFileId(book.fileId, transaction),
                                this.tableOfContentsService.deleteByFileId(book.fileId, transaction),
                            ]);

                        await Promise.all([
                            this.bookService.deleteById(bookId, transaction),
                            this.readingProgressService.deleteByBookId(bookId, transaction),
                        ]);
                    }
                ).then(() => this.navUi.dispatchNavItemClick(this.genreId));
            });
        }
    }

    bindEvent() {
        // 绑定头部事件
        this.headerUi
            .bindClearBookshelfClick(() => void this.clearBookshelf())
            .bindHeaderTitleClick(() => this.navUi.toggleVisibility());

        // 绑定导航栏事件
        this.navUi.bindNavItemClick(async (genreId) => {
            this.genreId = genreId;
            this.mainUi.removeBookElements();
            await TransactionManager.runTransaction(bookStore.name, "readonly", async (transaction) => {
                const books = await this.bookService.listByGenreId(genreId, transaction);
                books.forEach((book, index) => this.mainUi.renderBookElement(book, index));
            });
        });

        // 绑定书籍主体事件
        this.mainUi
            .bindBookInputChange(async (files) => {
                await this.addBook(files);
            })
            .bindBookBodyClick((bookId) => {
                this.readBook(bookId);
            })
            .bindDeleteBookClick(async (bookId) => {
                await this.deleteBook(bookId);
            });
    }

    /**
     * 根据文件hash分组书籍文件
     * @param  files - 书籍文件列表
     * @returns  分组的书籍文件数据
     */
    async #groupFilesByHash(files: FileList) {
        // 根据hash分组并行处理重复文件
        const groupedFiles: Map<string, NonEmptyArray<{ file: File; hash: string }>> = await Promise.all(
            Array.from(files)

                // 只处理文本文件
                .filter((file) => {
                    const isTextFile = file.type === "text/plain";
                    if (!isTextFile) void this.bookshelfUi.alertDialog(`${file.name}不是文本文件`);
                    return isTextFile;
                })

                // 所有添加的书籍文件
                .map(async (file) => ({
                    file: file,
                    hash: await FileUtil.computeHash(file),
                }))

            // 按hash分组[hash => [{file, hash}, ...]
        ).then((hashedFiles) =>
            hashedFiles.reduce((acc, hashedFile) => {
                if (!acc.has(hashedFile.hash)) {
                    acc.set(hashedFile.hash, [hashedFile]);
                } else {
                    acc.get(hashedFile.hash)?.push(hashedFile);
                }
                return acc;
            }, new Map<string, NonEmptyArray<{ file: File; hash: string }>>())
        );

        // 为每个分组生成数据
        const groupedFilesPromises = Array.from(groupedFiles.entries())

            // 为每个分组生成数据
            .map(async ([hash, hashedFiles]) => {
                // 将同一hash的文件视为同一书籍,只解析第一个文件的章节和目录
                const file = hashedFiles[0].file;

                // 检查文件是否已存在
                const existingFile = await TransactionManager.runTransaction(
                    [fileStore.name],
                    "readonly",
                    async (transaction) => await this.fileService.getByHash(hash, transaction)
                );

                // 已存相同hash的文件则跳过
                if (existingFile !== null) {
                    void this.bookshelfUi.alertDialog(`文件${file.name}已存在,已跳过添加`);
                    return null;
                }

                const bookFile = new BookFile({
                    id: crypto.randomUUID(),
                    file: file,
                    hash: hash,
                });
                const chapters = await FileUtil.parseChapters(file, bookFile.id);
                const tableOfContents = new TableOfContents({
                    id: crypto.randomUUID(),
                    fileId: bookFile.id,
                    contents: chapters,
                });
                return {
                    hash,
                    bookFile,
                    chapters,
                    tableOfContents,
                    books: hashedFiles.map((hashFile) => {
                        // 创建书籍
                        const book = new Book({
                            id: crypto.randomUUID(),
                            genreId: this.genreId,
                            fileId: bookFile.id,
                            hash: bookFile.hash,
                            title: FileUtil.extractTitle(hashFile.file.name),
                            createdTime: Date.now(),
                        });

                        // 创建阅读进度
                        const readingProgress = new ReadingProgress({
                            id: crypto.randomUUID(),
                            bookId: book.id,
                            chapterIndex: 1,
                            lineIndex: 1,
                            lineVisibleRatio: 1,
                        });
                        return { book, readingProgress };
                    }),
                };
            });

        // 过滤掉已存在的文件
        return await Promise.all(groupedFilesPromises).then((result) => result.filter((item) => item !== null));
    }
}
