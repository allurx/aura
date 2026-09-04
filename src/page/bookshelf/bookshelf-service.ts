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
import type Chapter from "@/domain/chapter/chapter";
import Toc from "@/domain/toc/toc";
import TocEntry from "@/domain/toc/toc-entry";
import type Category from "@/domain/category/category";
import Progress from "@/domain/progress/progress";
import type Metadata from "@/domain/metadata/metadata";
import MetadataService from "@/domain/metadata/metadata-service";
import CategoryService from "@/domain/category/category-service";
import BookService from "@/domain/book/book-service";
import ChapterService from "@/domain/chapter/chapter-service";
import ProgressService from "@/domain/progress/progress-service";
import TocService from "@/domain/toc/toc-service";
import BookFileService from "@/domain/file/book-file-service";
import TextEncodingDetector from "@/domain/file/text-encoding-detector";
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
    bookFileStore,
    bookStore,
    tocStore,
    chapterStore,
    progressStore,
} from "@/database/database-definition";

/**
 * 批量导入结果，供控制器分别更新书架和提示信息。
 * @author allurx
 */
interface BookImportResult {
    // 成功创建并需要渲染的书籍。
    books: Book[];

    // 禁止重复导入时因内容hash已存在而跳过的文件。
    duplicateFiles: File[];

    // 编码无法可靠识别或严格解码，因而未持久化的文件。
    unsupportedEncodingFiles: File[];
}

/**
 * 书架服务
 * @author allurx
 */
export default class BookshelfService {
    private readonly metadataService: MetadataService;
    private readonly categoryService: CategoryService;
    private readonly bookFileService: BookFileService;
    private readonly bookService: BookService;
    private readonly chapterService: ChapterService;
    private readonly progressService: ProgressService;
    private readonly tocService: TocService;
    // 在章节解析前自动识别并严格验证TXT文件编码。
    private readonly textEncodingDetector: TextEncodingDetector;

    public constructor() {
        this.metadataService = new MetadataService();
        this.categoryService = new CategoryService();
        this.bookFileService = new BookFileService();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.progressService = new ProgressService();
        this.tocService = new TocService();
        this.textEncodingDetector = new TextEncodingDetector();
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
        await this.refreshHandbookIfNeeded(seeds.metadata, defaultCategory);

        return new BookshelfState({
            metadata: seeds.metadata,
            categoryId: defaultCategory.id,
            categories: categories,
        });
    }

    /**
     * 导入书籍
     * @param files - 书籍文件列表
     * @param categoryId - 书籍分类id
     * @param allowDuplicateBooks - 是否允许为相同内容创建多个书籍记录
     * @returns 成功导入、重复跳过和编码不受支持的文件分类结果
     */
    public async importBooks(
        files: File[],
        categoryId: string,
        allowDuplicateBooks: boolean
    ): Promise<BookImportResult> {
        const books: Book[] = [];
        const duplicateFiles: File[] = [];
        const unsupportedEncodingFiles: File[] = [];

        // 同一hash只解析一次;不同hash组依次持久化,避免所有文件的章节数据同时驻留内存
        for (const [hash, groupedFiles] of await this.groupFilesByHash(files)) {
            const result = await this.importContentGroup(hash, groupedFiles, categoryId, allowDuplicateBooks);
            books.push(...result.books);
            duplicateFiles.push(...result.duplicateFiles);
            unsupportedEncodingFiles.push(...result.unsupportedEncodingFiles);
        }

        return {
            books,
            duplicateFiles,
            unsupportedEncodingFiles,
        };
    }

    /**
     * 删除书籍
     * @param bookId - 书籍id
     */
    public async deleteBook(bookId: string) {
        await TransactionManager.runTransaction(
            [bookFileStore.name, bookStore.name, chapterStore.name, tocStore.name, progressStore.name],
            DatabaseMode.READ_WRITE,
            async (transaction) => {
                const book = assertExists(
                    await this.bookService.getByKey(bookId, transaction),
                    `Book[${bookId}] not found`
                );

                // 计算相同hash的书籍数量
                // 如果该文件没有其他书籍则删除对应的file, chapter和toc
                if (
                    (await this.bookService.countByIndex(bookStore.indexes.idxFileId.name, book.fileId, transaction)) <=
                    1
                )
                    await Promise.all([
                        this.bookFileService.deleteByKey(book.fileId, transaction),
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
            [bookFileStore.name, bookStore.name, chapterStore.name, tocStore.name, progressStore.name],
            DatabaseMode.READ_WRITE,
            async (transaction) =>
                await Promise.all([
                    this.bookFileService.clear(transaction),
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
        // importBooks是async函数,需要在事务外部调用以避免事务被浏览器提前提交
        const metadata = await TransactionManager.runTransaction(
            [metadataStore.name],
            DatabaseMode.READ_ONLY,
            async (transaction) => await this.metadataService.getByField("appName", Aura.NAME, transaction)
        );
        if (!metadata) {
            const categories = createCategorySeeds();
            return await this.importBooks([createFileSeed()], assertExists(categories[0]).id, false)
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
     * @param allowDuplicateBooks - 是否允许为同一内容创建多个书籍记录
     * @returns 该内容组导入成功的书籍、重复文件和编码不受支持文件
     */
    private async importContentGroup(
        hash: string,
        files: File[],
        categoryId: string,
        allowDuplicateBooks: boolean
    ): Promise<BookImportResult> {
        const file = assertExists(files[0]);
        // BookFile记录按hash唯一;已存在时直接复用其章节和目录,无需再次解析
        let bookFile = await TransactionManager.runTransaction(
            bookFileStore.name,
            DatabaseMode.READ_ONLY,
            async (transaction) =>
                await this.bookFileService.getByIndex(bookFileStore.indexes.ukHash.name, hash, transaction)
        );

        const fileAlreadyExists = ObjectUtil.exists(bookFile);
        let bookData: { bookFile: BookFile; chapters: Chapter[]; toc: Toc } | null = null;
        if (!bookFile) {
            // 只解析组内第一个文件,其余文件与它内容完全相同
            console.log(`Parsing new file with hash: ${hash}`);
            // 检测失败时跳过整组文件，避免持久化乱码。
            const encoding = await this.textEncodingDetector.detect(file);
            if (!encoding) return { books: [], duplicateFiles: [], unsupportedEncodingFiles: files };
            bookFile = new BookFile({
                id: crypto.randomUUID(),
                file,
                hash,
                createdTime: Date.now(),
                updatedTime: Date.now(),
            });
            // 编码错误已收敛为null，其他异常继续向上抛出。
            const chapters = await this.chapterService.parseChapters(file, bookFile.id, encoding);
            bookData = {
                bookFile,
                chapters,
                toc: new Toc({
                    id: crypto.randomUUID(),
                    fileId: bookFile.id,
                    entries: chapters.map((chapter) => new TocEntry(chapter)),
                    createdTime: Date.now(),
                    updatedTime: Date.now(),
                }),
            };
        }

        // 允许重复时每个文件都创建书籍;否则已有内容全部跳过,新内容只添加第一个文件
        const filesForNewBooks = allowDuplicateBooks ? files : fileAlreadyExists ? [] : files.slice(0, 1);
        const bookEntries = filesForNewBooks.map((item) => {
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
                    chapterNumber: 1,
                    chapterLineNumber: 1,
                    lineVisibleRatio: 1,
                    createdTime: Date.now(),
                    updatedTime: Date.now(),
                }),
            };
        });
        // filesForNewBooks之外的文件均属于本次未添加的重复项
        const duplicateFiles = allowDuplicateBooks ? [] : files.slice(filesForNewBooks.length);

        if (bookEntries.length === 0) return { books: [], duplicateFiles, unsupportedEncodingFiles: [] };

        await TransactionManager.runTransaction(
            [
                // 新内容需要写入原文件、章节和目录;已有内容只新增书籍及进度
                ...(bookData ? [bookFileStore.name, chapterStore.name, tocStore.name] : []),
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
                        this.bookFileService.add(bookData.bookFile, transaction),
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

        return { books: bookEntries.map(({ book }) => book), duplicateFiles, unsupportedEncodingFiles: [] };
    }

    /**
     * 手册不存在或版本不匹配时，重新添加手册并更新元数据。
     * @param metadata - 元数据
     * @param defaultCategory - 默认分类
     * @see Aura.HANDBOOK_VERSION 当前内置手册版本
     */
    private async refreshHandbookIfNeeded(metadata: Metadata, defaultCategory: Category): Promise<void> {
        const handbookExists = ObjectUtil.exists(
            await TransactionManager.runTransaction(
                [bookStore.name],
                DatabaseMode.READ_ONLY,
                async (transaction) => await this.bookService.getByKey(metadata.handbookBookId, transaction)
            )
        );
        const isHandbookOutdated = metadata.handbookVersion !== Aura.HANDBOOK_VERSION;
        if (isHandbookOutdated || !handbookExists) {
            if (isHandbookOutdated && handbookExists) await this.deleteBook(metadata.handbookBookId);
            await this.importBooks([createFileSeed()], defaultCategory.id, true)
                .then(({ books }) => assertExists(books[0], "Handbook book not found"))
                .then(async (newHandbook) => {
                    await TransactionManager.runTransaction(
                        [metadataStore.name],
                        DatabaseMode.READ_WRITE,
                        async (transaction) => {
                            await this.metadataService.update(
                                metadata.update({
                                    handbookBookId: newHandbook.id,
                                    handbookVersion: Aura.HANDBOOK_VERSION,
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
