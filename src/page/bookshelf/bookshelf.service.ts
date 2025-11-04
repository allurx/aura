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

import Book from "../../domain/book/book.model";
import BookFile from "../../domain/file/file.model";
import Toc from "../../domain/toc/toc.model";
import ReadingProgress from "../../domain/reading-progress/reading-progress.model";
import CategoryService from "../../domain/category/category.service";
import BookService from "../../domain/book/book.service";
import ChapterService from "../../domain/chapter/chapter.service";
import ThemeService from "../../domain/theme/theme.service";
import ReadingProgressService from "../../domain/reading-progress/reading-progress.service";
import SettingService from "../../domain/setting/setting.service";
import TocService from "../../domain/toc/toc.service";
import FileService from "../../domain/file/file.service";
import FileUtil from "../../core/util/file.util";
import { assertExists } from "../../core/util/assert.util";
import TransactionManager from "../../core/database/transaction-manager";
import CategorySeed from "../../core/database/seed/category.seed";
import ThemeSeed from "../../core/database/seed/theme.seed";
import SettingSeed from "../../core/database/seed/setting.seed";
import {
    categoryStore,
    fileStore,
    bookStore,
    tocStore,
    chapterStore,
    settingStore,
    themeStore,
    readingProgressStore,
} from "../../core/database/database-definition";
import { SettingEnum } from "../../core/constant/setting.enum";
import { DatabaseModeEnum } from "../../core/constant/database-mode.enum";

/**
 * 书架服务
 * @author allurx
 */
export default class BookshelfService {
    private readonly categoryService: CategoryService;
    private readonly fileService: FileService;
    private readonly bookService: BookService;
    private readonly chapterService: ChapterService;
    private readonly themeService: ThemeService;
    private readonly readingProgressService: ReadingProgressService;
    private readonly settingService: SettingService;
    private readonly tocService: TocService;

    public constructor() {
        this.categoryService = new CategoryService();
        this.fileService = new FileService();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.themeService = new ThemeService();
        this.readingProgressService = new ReadingProgressService();
        this.settingService = new SettingService();
        this.tocService = new TocService();
    }

    /**
     * 添加书籍
     * @param files - 书籍文件列表
     * @param categoryId - 书籍分类id
     * @param callback - 每添加一本书籍后的回调函数
     */
    public async addBook(files: File[], categoryId: string, callback: (book: Book, index: number) => void) {
        // 在事务外部执行异步函数汇总数据以避免事务被浏览器提前提交
        const groupedHashFilesData = await this.groupFileByHash(files, categoryId);

        await TransactionManager.runTransaction(
            [
                // 有文件需要保存时才加入fileStore
                ...(groupedHashFilesData.some((item) => item.bookData !== null) ? [fileStore.name] : []),
                bookStore.name,
                chapterStore.name,
                tocStore.name,
                readingProgressStore.name,
            ],
            DatabaseModeEnum.READ_WRITE,
            async (transaction) => {
                await Promise.all(
                    groupedHashFilesData.map(async ({ hash, bookData, books }) => {
                        // 保存分组下的书籍文件、章节和目录
                        if (bookData) {
                            console.log(`Processing file with hash: ${hash}`);
                            await this.fileService.add(bookData.bookFile, transaction);
                            await this.chapterService.addAll(bookData.chapters, transaction);
                            await this.tocService.update(bookData.toc, transaction);
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
    public async deleteBook(bookId: string) {
        await TransactionManager.runTransaction(
            [fileStore.name, bookStore.name, chapterStore.name, tocStore.name, readingProgressStore.name],
            DatabaseModeEnum.READ_WRITE,
            async (transaction) => {
                // 如果该文件没有其他书籍则删除对应的file, chapter和toc
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
                        this.tocService.deleteByFileId(book.fileId, transaction),
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
    public async clearBookshelf() {
        await TransactionManager.runTransaction(
            [fileStore.name, bookStore.name, chapterStore.name, tocStore.name, readingProgressStore.name],
            DatabaseModeEnum.READ_WRITE,
            async (transaction) =>
                await Promise.all([
                    this.fileService.clear(transaction),
                    this.bookService.clear(transaction),
                    this.chapterService.clear(transaction),
                    this.tocService.clear(transaction),
                    this.readingProgressService.clear(transaction),
                ])
        );
    }

    /**
     * 点击导航栏分类项
     * @param categoryId - 分类id
     * @param callback - 每获取一本书籍后的回调函数
     */
    public async clickNavItem(categoryId: string, callback: (book: Book, index: number) => void) {
        await TransactionManager.runTransaction(bookStore.name, DatabaseModeEnum.READ_ONLY, async (transaction) => {
            const books = await this.bookService.getAllByCategoryId(categoryId, transaction);
            books.forEach((book, index) => {
                callback(book, index);
            });
        });
    }

    /**
     * 获取所有分类
     */
    public async getAllCategories() {
        return await TransactionManager.runTransaction(
            [categoryStore.name],
            DatabaseModeEnum.READ_ONLY,
            async (transaction) => {
                return await this.categoryService.getAll(transaction);
            }
        );
    }

    /**
     * 初始化种子数据
     */
    public async seedDatabase() {
        await TransactionManager.runTransaction(
            [categoryStore.name, settingStore.name, themeStore.name],
            DatabaseModeEnum.READ_WRITE,
            async (transaction) => {
                if ((await this.settingService.count(SettingEnum.DEFAULT_READER_SETTING, transaction)) === 0) {
                    await this.settingService.add(SettingSeed.defaultReaderSetting, transaction);
                    await this.settingService.add(SettingSeed.readerSetting, transaction);
                    await this.categoryService.addAll(CategorySeed.categories, transaction);
                    await this.themeService.addAll(ThemeSeed.themes, transaction);
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
    private async groupFileByHash(files: File[], categoryId: string) {
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
                DatabaseModeEnum.READ_ONLY,
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
                const chapters = await this.chapterService.parseChapters(file, bookFile.id);
                const toc = new Toc({
                    id: crypto.randomUUID(),
                    fileId: bookFile.id,
                    contents: chapters.map((chapter) => new Toc.Content(chapter)),
                });
                bookData = {
                    bookFile: bookFile,
                    chapters: chapters,
                    toc: toc,
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
