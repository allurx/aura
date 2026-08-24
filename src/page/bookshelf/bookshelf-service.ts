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

import Aura from "@/core/aura";
import Book from "@/domain/book/book";
import BookFile from "@/domain/file/book-file";
import Chapter from "@/domain/chapter/chapter";
import Toc from "@/domain/toc/toc";
import Category from "@/domain/category/category";
import Progress from "@/domain/progress/progress";
import Metadata from "@/domain/metadata/metadata";
import MetadataService from "@/domain/metadata/metadata-service";
import CategoryService from "@/domain/category/category-service";
import BookService from "@/domain/book/book-service";
import ChapterService from "@/domain/chapter/chapter-service";
import ProgressService from "@/domain/progress/progress-service";
import TocService from "@/domain/toc/toc-service";
import FileService from "@/domain/file/file-service";
import FileUtil from "@/util/file-util";
import ObjectUtil from "@/util/object-util";
import TransactionManager from "@/database/transaction-manager";
import { createMetadataSeed } from "@/database/seed/metadata-seed";
import { createFileSeed } from "@/database/seed/file-seed";
import { createCategorySeeds } from "@/database/seed/category-seed";
import BookshelfState from "./bookshelf-state";
import { assertExists } from "@/util/assert-util";
import { DatabaseMode } from "@/database/database-mode";
import {
    metadataStore,
    categoryStore,
    fileStore,
    bookStore,
    tocStore,
    chapterStore,
    progressStore,
} from "@/database/database-definition";

/**
 * 书架服务
 * @author allurx
 */
export default class BookshelfService {
    private readonly metadataService: MetadataService;
    private readonly categoryService: CategoryService;
    private readonly fileService: FileService;
    private readonly bookService: BookService;
    private readonly chapterService: ChapterService;
    private readonly progressService: ProgressService;
    private readonly tocService: TocService;

    public constructor() {
        this.metadataService = new MetadataService();
        this.categoryService = new CategoryService();
        this.fileService = new FileService();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.progressService = new ProgressService();
        this.tocService = new TocService();
    }

    public async init() {
        const seeds = await this.seedDatabase();
        const categories =
            seeds.categories ??
            (await TransactionManager.runTransaction(
                [categoryStore.name],
                DatabaseMode.READ_ONLY,
                async (transaction) => await this.categoryService.getAll(transaction)
            ));
        const defaultCategory = assertExists(
            categories.find((category) => category.order === 1),
            "Default category not found"
        );

        // 检查元数据
        await this.checkMetadata(seeds.metadata, defaultCategory);

        return new BookshelfState({
            metadata: seeds.metadata,
            categoryId: defaultCategory.id,
            categories: categories,
        });
    }

    /**
     * 添加书籍
     * @param files - 书籍文件列表
     * @param categoryId - 书籍分类id
     * @param allowDuplicate - 相同hash文件是否允许重复添加
     * @returns  添加的书籍列表
     */
    public async addBook(
        files: File[],
        categoryId: string,
        allowDuplicate: boolean
    ): Promise<{ books: Book[]; duplicateFiles: File[] }> {
        const books: Book[] = [];
        const duplicateFiles: File[] = [];

        // 同一hash只解析一次;不同hash组依次持久化,避免所有文件的章节数据同时驻留内存
        for (const [hash, groupedFiles] of await this.groupFilesByHash(files)) {
            const result = await this.addBookGroup(hash, groupedFiles, categoryId, allowDuplicate);
            books.push(...result.books);
            duplicateFiles.push(...result.duplicateFiles);
        }

        return {
            books,
            duplicateFiles,
        };
    }

    /**
     * 删除书籍
     * @param bookId - 书籍id
     */
    public async deleteBook(bookId: string) {
        await TransactionManager.runTransaction(
            [fileStore.name, bookStore.name, chapterStore.name, tocStore.name, progressStore.name],
            DatabaseMode.READ_WRITE,
            async (transaction) => {
                const book = assertExists(
                    await this.bookService.getByKey(bookId, transaction),
                    `Book[${bookId}] not found`
                );

                // 计算相同hash的书籍数量
                // 如果该文件没有其他书籍则删除对应的file, chapter和toc
                if (
                    (await this.bookService.countByIndex(
                        bookStore.indexes.idxFileId.name,
                        book.fileId,
                        transaction
                    )) <= 1
                )
                    await Promise.all([
                        this.fileService.deleteByKey(book.fileId, transaction),
                        this.chapterService.deleteAllByIndex(
                            chapterStore.indexes.idxFileId.name,
                            book.fileId,
                            transaction
                        ),
                        this.tocService.deleteByIndex(tocStore.indexes.ukFileId.name, book.fileId, transaction),
                    ]);

                await Promise.all([
                    this.bookService.deleteByKey(bookId, transaction),
                    this.progressService.deleteByIndex(progressStore.indexes.ukBookId.name, bookId, transaction),
                ]);
            }
        );
    }

    /**
     * 清空书架
     */
    public async clearBookshelf() {
        await TransactionManager.runTransaction(
            [fileStore.name, bookStore.name, chapterStore.name, tocStore.name, progressStore.name],
            DatabaseMode.READ_WRITE,
            async (transaction) =>
                await Promise.all([
                    this.fileService.clear(transaction),
                    this.bookService.clear(transaction),
                    this.chapterService.clear(transaction),
                    this.tocService.clear(transaction),
                    this.progressService.clear(transaction),
                ])
        );
    }

    /**
     * 获取指定分类下的所有书籍
     * @param categoryId - 书籍分类id
     * @returns  书籍列表
     */
    public async getBooksByCategoryId(categoryId: string): Promise<Book[]> {
        return await TransactionManager.runTransaction(bookStore.name, DatabaseMode.READ_ONLY, async (transaction) => {
            return await this.bookService.getAllByIndex(bookStore.indexes.idxCategoryId.name, categoryId, transaction);
        });
    }

    /**
     * 初始化种子数据
     */
    private async seedDatabase() {
        // addBook是async函数,需要在事务外部调用以避免事务被浏览器提前提交
        const metadata = await TransactionManager.runTransaction(
            [metadataStore.name],
            DatabaseMode.READ_ONLY,
            async (transaction) => await this.metadataService.getByField("appName", Aura.NAME, transaction)
        );
        if (!metadata) {
            const categories = createCategorySeeds();
            return await this.addBook([createFileSeed()], assertExists(categories[0]).id, false)
                .then(({ books }) => assertExists(books[0], "Handbook book not found"))
                .then(async (handbook) => {
                    return await TransactionManager.runTransaction(
                        [metadataStore.name, categoryStore.name],
                        DatabaseMode.READ_WRITE,
                        async (transaction) => {
                            const metadata = createMetadataSeed(handbook.id);
                            await Promise.all([
                                this.metadataService.add(metadata, transaction),
                                this.categoryService.addAll(categories, transaction),
                            ]);
                            return {
                                metadata,
                                categories,
                            };
                        }
                    );
                });
        }
        return {
            metadata,
            categories: null,
        };
    }

    /**
     * 根据文件hash分组书籍文件
     * @param files - 书籍文件列表
     * @returns hash到同内容文件列表的映射
     */
    private async groupFilesByHash(files: File[]) {
        const groupedFiles = new Map<string, File[]>();
        // 逐个计算hash,避免多个大文件同时加载到内存
        for (const file of files) {
            const hash = await FileUtil.computeHash(file);
            const grouped = groupedFiles.get(hash);
            if (grouped) grouped.push(file);
            else groupedFiles.set(hash, [file]);
        }
        return groupedFiles;
    }

    /**
     * 解析并保存一组内容相同的文件
     * @param hash - 文件内容hash
     * @param files - 内容相同的文件列表
     * @param categoryId - 书籍分类id
     * @param allowDuplicate - 是否为同一内容创建多本书
     * @returns 新增书籍及未添加的重复文件
     */
    private async addBookGroup(
        hash: string,
        files: File[],
        categoryId: string,
        allowDuplicate: boolean
    ): Promise<{ books: Book[]; duplicateFiles: File[] }> {
        const file = assertExists(files[0]);
        // file记录按hash唯一;已存在时直接复用其章节和目录,无需再次解析
        let bookFile = await TransactionManager.runTransaction(
            fileStore.name,
            DatabaseMode.READ_ONLY,
            async (transaction) => await this.fileService.getByIndex(fileStore.indexes.ukHash.name, hash, transaction)
        );

        const existingFile = ObjectUtil.exists(bookFile);
        let bookData: { bookFile: BookFile; chapters: Chapter[]; toc: Toc } | null = null;
        if (!bookFile) {
            // 只解析组内第一个文件,其余文件与它内容完全相同
            console.log(`Parsing new file with hash: ${hash}`);
            bookFile = new BookFile({
                id: crypto.randomUUID(),
                file,
                hash,
                createdTime: Date.now(),
                updatedTime: Date.now(),
            });
            const chapters = await this.chapterService.parseChapters(file, bookFile.id);
            bookData = {
                bookFile,
                chapters,
                toc: new Toc({
                    id: crypto.randomUUID(),
                    fileId: bookFile.id,
                    contents: chapters.map((chapter) => new Toc.Content(chapter)),
                    createdTime: Date.now(),
                    updatedTime: Date.now(),
                }),
            };
        }

        // 允许重复时每个文件都创建书籍;否则已有内容全部跳过,新内容只添加第一个文件
        const filesToAdd = allowDuplicate ? files : existingFile ? [] : files.slice(0, 1);
        const bookEntries = filesToAdd.map((item) => {
            const book = new Book({
                id: crypto.randomUUID(),
                categoryId,
                fileId: assertExists(bookFile).id,
                fileName: item.name,
                createdTime: Date.now(),
                updatedTime: Date.now(),
            });
            return {
                book,
                progress: new Progress({
                    id: crypto.randomUUID(),
                    bookId: book.id,
                    chapterIndex: 1,
                    lineIndex: 1,
                    lineVisibleRatio: 1,
                    createdTime: Date.now(),
                    updatedTime: Date.now(),
                }),
            };
        });
        // filesToAdd之外的文件均属于本次未添加的重复项
        const duplicateFiles = allowDuplicate ? [] : files.slice(filesToAdd.length);

        if (bookEntries.length === 0) return { books: [], duplicateFiles };

        await TransactionManager.runTransaction(
            [
                // 新内容需要写入原文件、章节和目录;已有内容只新增书籍及进度
                ...(bookData ? [fileStore.name, chapterStore.name, tocStore.name] : []),
                bookStore.name,
                progressStore.name,
            ],
            DatabaseMode.READ_WRITE,
            async (transaction) => {
                if (bookData) {
                    console.log(`Processing file with hash: ${hash}`);
                    // IndexedDB会在同一事务内按提交顺序处理请求。先将请求全部入队可避免逐章
                    // await 带来的事件循环往返，同时仍保持不同文件依次解析和持久化。
                    await Promise.all([
                        this.fileService.add(bookData.bookFile, transaction),
                        this.chapterService.addAll(bookData.chapters, transaction),
                        this.tocService.add(bookData.toc, transaction),
                    ]);
                }

                for (const { book, progress } of bookEntries) {
                    await Promise.all([
                        this.bookService.add(book, transaction),
                        this.progressService.add(progress, transaction),
                    ]);
                }
            }
        );

        return { books: bookEntries.map(({ book }) => book), duplicateFiles };
    }

    /**
     * 检查并处理版本变更,手册不存在或者版本不匹配则重新添加手册并更新元数据
     * @param metadata - 元数据
     * @param defaultCategory - 默认分类
     * @see Aura.VERSION 当前应用版本
     */
    private async checkMetadata(metadata: Metadata, defaultCategory: Category): Promise<void> {
        const existsHandbook = ObjectUtil.exists(
            await TransactionManager.runTransaction(
                [bookStore.name],
                DatabaseMode.READ_ONLY,
                async (transaction) => await this.bookService.getByKey(metadata.handbookId, transaction)
            )
        );
        const isVersionChanged = Aura.isVersionChanged(metadata.version);
        if (isVersionChanged || !existsHandbook) {
            if (isVersionChanged && existsHandbook) await this.deleteBook(metadata.handbookId);
            await this.addBook([createFileSeed()], defaultCategory.id, true)
                .then(({ books }) => assertExists(books[0], "Handbook book not found"))
                .then(async (newHandbook) => {
                    await TransactionManager.runTransaction(
                        [metadataStore.name],
                        DatabaseMode.READ_WRITE,
                        async (transaction) => {
                            await this.metadataService.update(
                                metadata.update({
                                    handbookId: newHandbook.id,
                                    version: Aura.VERSION,
                                    updatedTime: Date.now(),
                                }),
                                transaction
                            );
                        }
                    );
                });
        }
    }
}
