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

import Book from "../model/book";
import BookFile from "../model/bookFile";
import TableOfContents from "../model/tableOfContents";
import ReadingProgress from "../model/readingProgress";
import CategoryService from "./categoryService";
import BookService from "./bookService";
import ChapterService from "./chapterService";
import ThemeService from "./themeService";
import ReadingProgressService from "./readingProgressService";
import SettingService from "./settingService";
import TableOfContentsService from "./tableOfContentsService";
import FileService from "./fileService";
import FileUtil from "../util/fileUtil";
import { assertExists } from "../util/assertUtil";
import TransactionManager from "../core/database/transactionManager.js";
import CategorySeed from "../core/database/seed/categorySeed";
import ThemeSeed from "../core/database/seed/themeSeed";
import SettingSeed from "../core/database/seed/settingSeed";
import {
    categoryStore,
    fileStore,
    bookStore,
    tableOfContentsStore,
    chapterStore,
    settingStore,
    themeStore,
    readingProgressStore,
} from "../core/database/DatabaseDefinition.js";

/**
 * 书架服务
 * @author allurx
 */
export default class BookshelfService {
    categoryService: CategoryService;
    fileService: FileService;
    bookService: BookService;
    chapterService: ChapterService;
    themeService: ThemeService;
    readingProgressService: ReadingProgressService;
    settingService: SettingService;
    tableOfContentsService: TableOfContentsService;

    constructor() {
        this.categoryService = new CategoryService();
        this.fileService = new FileService();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.themeService = new ThemeService();
        this.readingProgressService = new ReadingProgressService();
        this.settingService = new SettingService();
        this.tableOfContentsService = new TableOfContentsService();
    }

    /**
     * 添加书籍
     * @param files - 书籍文件列表
     * @param categoryId - 书籍分类id
     * @param callback - 每添加一本书籍后的回调函数
     */
    async addBook(files: File[], categoryId: string, callback: (book: Book, index: number) => void) {
        // 在事务外部执行异步函数汇总数据以避免事务被浏览器提前提交
        const groupedHashFilesData = await this.#groupFileByHash(files, categoryId);

        await TransactionManager.runTransaction(
            [
                // 有文件需要保存时才加入fileStore
                ...(groupedHashFilesData.some((item) => item.bookData !== null) ? [fileStore.name] : []),
                bookStore.name,
                chapterStore.name,
                tableOfContentsStore.name,
                readingProgressStore.name,
            ],
            "readwrite",
            async (transaction) => {
                await Promise.all(
                    groupedHashFilesData.map(async ({ hash, bookData, books }) => {
                        // 保存分组下的书籍文件、章节和目录
                        if (bookData) {
                            console.log(`Processing file with hash: ${hash}`);
                            await this.fileService.add(bookData.bookFile, transaction);
                            await this.chapterService.addAll(bookData.chapters, transaction);
                            await this.tableOfContentsService.update(bookData.tableOfContents, transaction);
                        }

                        // 保存分组下的所有书籍和阅读进度
                        const bookPromises = books.map(async ({ book, readingProgress }) => {
                            await this.bookService.add(book, transaction);
                            await this.readingProgressService.update(readingProgress, transaction);

                            callback(book, 1);
                            // 创建书籍元素
                            //this.mainUi.renderBookElement(book, 1);
                        });
                        await Promise.all(bookPromises);
                    })
                );
            }
        );
    }

    /**
     * 删除书籍
     * @param bookId - 书籍id
     */
    async deleteBook(bookId: string) {
        await TransactionManager.runTransaction(
            [fileStore.name, bookStore.name, chapterStore.name, tableOfContentsStore.name, readingProgressStore.name],
            "readwrite",
            async (transaction) => {
                // 如果该文件没有其他书籍则删除对应的file, chapter和tableOfContents
                const book = assertExists(
                    await this.bookService.getById(bookId, transaction),
                    `Book[${bookId}] not found`
                );

                // 计算相同hash的书籍数量
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
        );
    }

    /**
     * 清空书架
     */
    async clearBookshelf() {
        await TransactionManager.runTransaction(
            [fileStore.name, bookStore.name, chapterStore.name, tableOfContentsStore.name, readingProgressStore.name],
            "readwrite",
            async (transaction) =>
                await Promise.all([
                    this.fileService.clear(transaction),
                    this.bookService.clear(transaction),
                    this.chapterService.clear(transaction),
                    this.tableOfContentsService.clear(transaction),
                    this.readingProgressService.clear(transaction),
                ])
        );
    }

    /**
     * 点击导航栏分类项
     * @param categoryId - 分类id
     * @param callback - 每获取一本书籍后的回调函数
     */
    async clickNavItem(categoryId: string, callback: (book: Book, index: number) => void) {
        await TransactionManager.runTransaction(bookStore.name, "readonly", async (transaction) => {
            const books = await this.bookService.getAllByCategoryId(categoryId, transaction);
            books.forEach((book, index) => {
                callback(book, index);
            });
        });
    }

    /**
     * 获取所有分类
     */
    async getAllCategories() {
        return await TransactionManager.runTransaction([categoryStore.name], "readonly", async (transaction) => {
            return await this.categoryService.getAll(transaction);
        });
    }

    /**
     * 初始化种子数据
     */
    async seedDatabase() {
        await TransactionManager.runTransaction(
            [categoryStore.name, settingStore.name, themeStore.name],
            "readwrite",
            async (transaction) => {
                if ((await this.categoryService.count(transaction)) === 0) {
                    await this.categoryService.addAll(CategorySeed.categories, transaction);
                }
                if ((await this.themeService.count(transaction)) === 0) {
                    await this.themeService.addAll(ThemeSeed.themes, transaction);
                }
                if ((await this.settingService.count("defaultReaderSetting", transaction)) === 0) {
                    await this.settingService.add(SettingSeed.defaultReaderSetting, transaction);
                }
                if ((await this.settingService.count("readerSetting", transaction)) === 0) {
                    await this.settingService.add(SettingSeed.readerSetting, transaction);
                }
            }
        );
    }

    /**
     * 根据文件hash分组书籍文件
     * @param  files - 书籍文件列表
     * @param categoryId - 书籍分类id
     * @returns  分组的书籍文件数据
     */
    async #groupFileByHash(files: File[], categoryId: string) {
        // 计算所有文件的hash
        const hashedFilesPromises = files.map(async (file) => ({
            file: file,
            hash: await FileUtil.computeHash(file),
        }));

        // 根据hash分组
        const groupedHashFiles = await Promise.all(hashedFilesPromises).then((hashedFiles) =>
            Map.groupBy(hashedFiles, (hashedFile) => hashedFile.hash)
        );

        // 为每个分组生成数据
        const groupedHashFilesDataPromises = groupedHashFiles.entries().map(async ([hash, groupedHashedFiles]) => {
            // 将同一hash的文件视为同一书籍,只解析第一个文件的章节和目录
            const file = assertExists(groupedHashedFiles[0]).file;

            // 检查文件是否已存在
            const existingFile = await TransactionManager.runTransaction(
                [fileStore.name],
                "readonly",
                async (transaction) => await this.fileService.getByHash(hash, transaction)
            );

            // 如果文件不存在则解析章节和目录
            let bookData = null;
            if (!existingFile) {
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
                bookData = {
                    bookFile: bookFile,
                    chapters: chapters,
                    tableOfContents: tableOfContents,
                };
            }

            return {
                hash,
                bookData,
                books: groupedHashedFiles.map((hashFile) => {
                    // 已存在的文件或新解析的文件
                    const bookfile = existingFile ?? assertExists(bookData).bookFile;

                    // 书籍
                    const book = new Book({
                        id: crypto.randomUUID(),
                        categoryId: categoryId,
                        fileId: bookfile.id,
                        fileName: hashFile.file.name,
                        createdTime: Date.now(),
                    });

                    // 阅读进度
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
        return await Promise.all(groupedHashFilesDataPromises);
    }
}
