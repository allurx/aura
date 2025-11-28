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

import Aura from "../../core/aura";
import Book from "../../domain/book/book";
import BookFile from "../../domain/file/file";
import Chapter from "../../domain/chapter/chapter";
import Toc from "../../domain/toc/toc";
import Category from "../../domain/category/category";
import Progress from "../../domain/progress/progress";
import Metadata from "../../domain/metadata/metadata";
import MetadataService from "../../domain/metadata/metadata-service";
import CategoryService from "../../domain/category/category-service";
import BookService from "../../domain/book/book-service";
import ChapterService from "../../domain/chapter/chapter-service";
import ProgressService from "../../domain/progress/progress-service";
import TocService from "../../domain/toc/toc-service";
import FileService from "../../domain/file/file-service";
import FileUtil from "../../util/file-util";
import ObjectUtil from "../../util/object-util";
import ArrayUtil from "../../util/array-util";
import TransactionManager from "../../database/transaction-manager";
import MetadataSeed from "../../database/seed/metadata-seed";
import FileSeed from "../../database/seed/file-seed";
import CategorySeed from "../../database/seed/category-seed";
import BookshelfState from "./bookshelf-state";
import { assertExists } from "../../util/assert-util";
import { DatabaseMode } from "../../database/database-mode";
import {
    metadataStore,
    categoryStore,
    fileStore,
    bookStore,
    tocStore,
    chapterStore,
    progressStore,
} from "../../database/database-definition";

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
        const metadata = seeds.metadata;
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
        await this.checkMetadata(metadata, defaultCategory);

        return new BookshelfState({
            metadata: metadata,
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
        // 在事务外部执行异步函数汇总数据以避免事务被浏览器提前提交
        const groupedHashFilesData = await this.groupFileByHash(files, categoryId, allowDuplicate);

        // 全部文件均为重复文件则直接返回
        if (groupedHashFilesData.every((item) => ArrayUtil.isEmpty(item.books)))
            return { books: [], duplicateFiles: files };

        await TransactionManager.runTransaction(
            [
                // 有文件需要保存时才加入fileStore
                ...(groupedHashFilesData.some((item) => item.bookData !== null) ? [fileStore.name] : []),
                bookStore.name,
                chapterStore.name,
                tocStore.name,
                progressStore.name,
            ],
            DatabaseMode.READ_WRITE,
            async (transaction) => {
                const groupsPromises = groupedHashFilesData.map(({ hash, bookData, books }) => {
                    // 保存分组下的书籍文件、章节和目录
                    const groupPromises: Promise<void>[] = [];
                    if (bookData) {
                        console.log(`Processing file with hash: ${hash}`);
                        groupPromises.push(
                            this.fileService.add(bookData.bookFile, transaction),
                            this.chapterService.addAll(bookData.chapters, transaction),
                            this.tocService.add(bookData.toc, transaction)
                        );
                    }

                    // 保存分组下的所有书籍和阅读进度
                    books.forEach(({ book, progress }) => {
                        groupPromises.push(
                            this.bookService.add(book, transaction),
                            this.progressService.add(progress, transaction)
                        );
                    });
                    return groupPromises;
                });
                await Promise.all(groupsPromises.flat());
            }
        );

        return {
            books: groupedHashFilesData.flatMap(({ books }) => books).map(({ book }) => book),
            duplicateFiles: groupedHashFilesData.flatMap(({ duplicateFiles }) => duplicateFiles),
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
                const count = await this.bookService.countByIndex(
                    bookStore.indexes.idxFileId.name,
                    book.fileId,
                    transaction
                );

                // 如果该文件没有其他书籍则删除对应的file, chapter和toc
                if (count <= 1)
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
            return await this.addBook([FileSeed.file], assertExists(CategorySeed.categories[0]).id, false)
                .then(({ books }) => assertExists(books[0], "Handbook book not found"))
                .then(async (handbook) => {
                    return await TransactionManager.runTransaction(
                        [metadataStore.name, categoryStore.name],
                        DatabaseMode.READ_WRITE,
                        async (transaction) => {
                            const metadata = MetadataSeed.metadata(handbook.id);
                            await Promise.all([
                                this.metadataService.add(metadata, transaction),
                                this.categoryService.addAll(CategorySeed.categories, transaction),
                            ]);
                            return {
                                metadata,
                                categories: CategorySeed.categories,
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
     * @param  files - 书籍文件列表
     * @param categoryId - 书籍分类id
     * @param allowDuplicate - 相同hash文件是否允许重复添加
     */
    private async groupFileByHash(files: File[], categoryId: string, allowDuplicate: boolean) {
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
        const groupedHashFilesDataPromises = groupedHashFiles.values().map(async (groupedHashedFiles) => {
            const firstGroupedHashedFile = assertExists(groupedHashedFiles[0]);
            const file = firstGroupedHashedFile.file;
            const hash = firstGroupedHashedFile.hash;
            // 存储当前分组下的重复文件
            const duplicateFiles: File[] = [];

            // 检查文件是否已存在
            let bookFile = await TransactionManager.runTransaction(
                [fileStore.name],
                DatabaseMode.READ_ONLY,
                async (transaction) =>
                    await this.fileService.getByIndex(fileStore.indexes.ukHash.name, hash, transaction)
            );

            const existingFile = !ObjectUtil.isNull(bookFile);
            let bookData: { bookFile: BookFile; chapters: Chapter[]; toc: Toc } | null = null;
            let books: { book: Book; progress: Progress }[] = [];
            // 文件不存在则解析第一个文件生成书籍数据
            if (!existingFile) {
                console.log(`Parsing new file with hash: ${hash}`);
                bookFile = new BookFile({
                    id: crypto.randomUUID(),
                    file: file,
                    hash: hash,
                    createdTime: Date.now(),
                    updatedTime: Date.now(),
                });
                const chapters = await this.chapterService.parseChapters(file, bookFile.id);
                const toc = new Toc({
                    id: crypto.randomUUID(),
                    fileId: bookFile.id,
                    contents: chapters.map((chapter) => new Toc.Content(chapter)),
                    createdTime: Date.now(),
                    updatedTime: Date.now(),
                });
                bookData = {
                    bookFile: bookFile,
                    chapters: chapters,
                    toc: toc,
                };
            }

            // 为分组下的文件生成书籍和阅读进度
            // 如果允许重复则全部生成
            // 如果不允许重复则仅当前分组的文件不存在时生成第一个文件的书籍
            books = (allowDuplicate ? groupedHashedFiles : existingFile ? [] : [firstGroupedHashedFile]).map(
                (hashFile) => {
                    const book = new Book({
                        id: crypto.randomUUID(),
                        categoryId: categoryId,
                        fileId: assertExists(bookFile).id,
                        fileName: hashFile.file.name,
                        createdTime: Date.now(),
                        updatedTime: Date.now(),
                    });
                    const progress = new Progress({
                        id: crypto.randomUUID(),
                        bookId: book.id,
                        chapterIndex: 1,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                        createdTime: Date.now(),
                        updatedTime: Date.now(),
                    });
                    return { book, progress };
                }
            );

            // 处理重复文件
            if (!allowDuplicate) {
                // 如果当前分组的文件已存在则全部为重复文件
                if (existingFile) {
                    groupedHashedFiles.forEach((item) => duplicateFiles.push(item.file));
                    //  否则除了第一个文件外其余均为重复文件
                } else {
                    groupedHashedFiles.shift();
                    groupedHashedFiles.forEach((item) => duplicateFiles.push(item.file));
                }
            }

            // 每个hash分组的数据
            return {
                hash,
                bookData,
                books: books,
                duplicateFiles,
            };
        });
        return await Promise.all(groupedHashFilesDataPromises);
    }

    /**
     * 检查并处理版本变更,手册不存在或者版本不匹配则重新添加手册并更新元数据
     * @param metadata - 元数据
     * @param defaultCategory - 默认分类
     * @see Aura.VERSION 当前应用版本
     */
    private async checkMetadata(metadata: Metadata, defaultCategory: Category): Promise<void> {
        const handbook = await TransactionManager.runTransaction(
            [bookStore.name],
            DatabaseMode.READ_ONLY,
            async (transaction) => await this.bookService.getByKey(metadata.handbookId, transaction)
        );
        const isVersionChanged = Aura.isVersionChanged(metadata.version);
        const existsHandbook = ObjectUtil.exists(handbook);
        if (isVersionChanged || !existsHandbook) {
            if (isVersionChanged && existsHandbook) await this.deleteBook(metadata.handbookId);
            await this.addBook([FileSeed.file], defaultCategory.id, true)
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
