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

import { APP_NAME } from "@/app-info";
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
import FileUtil from "@/utils/file-util";
import ObjectUtil from "@/utils/object-util";
import TransactionManager from "@/database/transaction-manager";
import { createCategorySeeds } from "./seeds/category-seed";
import { createHandbookFile, HANDBOOK_VERSION } from "./seeds/handbook-seed";
import { createMetadataSeed } from "./seeds/metadata-seed";
import BookshelfState from "./bookshelf-state";
import { assertExists } from "@/utils/assert-util";
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
export interface BookImportResult {
    // 成功创建并需要渲染的书籍。
    books: Book[];

    // 禁止重复导入时跳过的已有内容或同批次重复文件。
    duplicateFiles: File[];

    // 编码无法可靠识别或严格解码，因而未持久化的文件。
    unsupportedEncodingFiles: File[];
}

/**
 * 只包含书架显示需要的数据，不加载正文或原文件。
 * @author allurx
 */
export interface BookSummary {
    book: Book;
    title: string;
    progress: string;
}

/**
 * 批次中断时保留已完成结果、未完成文件与原始异常。
 * @author allurx
 */
export class BookImportError extends Error {
    /**
     * 记录已完成的导入结果及本次尚未完成的文件。
     */
    public constructor(
        public readonly result: BookImportResult,
        public readonly unfinishedFiles: File[],
        cause: unknown
    ) {
        super("部分文件未能导入", { cause });
        this.name = "BookImportError";
    }
}

/**
 * 编排书籍导入、摘要读取及跨领域数据的事务操作。
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
    // 在章节解析前自动识别并严格验证 TXT 文件编码。
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

    /**
     * 初始化缺失的种子数据并刷新内置手册，返回全部书籍入口的页面状态。
     */
    public async init() {
        // 首次启动直接复用新建分类，后续启动从领域存储读取。
        const seeds = await this.seedDatabase();
        const categories =
            seeds.categories ??
            (await TransactionManager.runTransaction(
                [categoryStore.name],
                DatabaseMode.READ_ONLY,
                async (transaction) => await this.categoryService.getAll(transaction)
            ));

        // 默认分类承担手册归属，元数据在刷新后指向可用的手册记录。
        const defaultCategory = assertExists(
            categories.find((category) => category.order === 1),
            "Default category not found"
        );

        await this.refreshHandbookIfNeeded(seeds.metadata, defaultCategory);

        return new BookshelfState({
            metadata: seeds.metadata,
            categoryId: "",
            categories: categories,
        });
    }

    /**
     * 按内容分组导入，每组独立提交；编码不受支持的组跳过，其余异常中断批次。
     * @param files - 书籍文件列表
     * @param categoryId - 书籍分类id
     * @param allowDuplicateBooks - 是否允许为相同内容创建多个书籍记录
     * @param reportProgress - 可选的当前处理阶段提示
     * @returns 成功导入、重复跳过和编码不受支持的文件分类结果
     * @throws {BookImportError} 保留已完成结果与未完成文件，cause 指向原始异常
     */
    public async importBooks(
        files: File[],
        categoryId: string,
        allowDuplicateBooks: boolean,
        reportProgress?: (message: string) => void
    ): Promise<BookImportResult> {
        const books: Book[] = [];
        const duplicateFiles: File[] = [];
        const unsupportedEncodingFiles: File[] = [];

        // 同一 hash 只解析一次；未完成集合仅在整组已导入或已明确跳过后移除。
        const unfinishedFiles = new Set(files);
        try {
            for (const [hash, groupedFiles] of await this.groupFilesByHash(files, reportProgress)) {
                const result = await this.importContentGroup(
                    hash,
                    groupedFiles,
                    categoryId,
                    allowDuplicateBooks,
                    reportProgress
                );

                // 整组处理完成后再累加结果，中断异常只携带此前已完成的部分。
                books.push(...result.books);
                duplicateFiles.push(...result.duplicateFiles);
                unsupportedEncodingFiles.push(...result.unsupportedEncodingFiles);
                groupedFiles.forEach((file) => unfinishedFiles.delete(file));
            }
        } catch (error) {
            throw new BookImportError({ books, duplicateFiles, unsupportedEncodingFiles }, [...unfinishedFiles], error);
        }

        return {
            books,
            duplicateFiles,
            unsupportedEncodingFiles,
        };
    }

    /**
     * 在同一事务中删除书籍及进度，仅在最后一本引用移除时清理共享内容。
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

                // 同内容的多本书共享原文件、章节与目录，其他书仍引用时必须保留。
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

                // 书籍和它独有的进度始终删除，共享内容是否保留不影响此步。
                await Promise.all([
                    this.bookService.deleteByKey(bookId, transaction),
                    this.progressService.deleteByIndex(progressStore.indexes.ukBookId.name, bookId, transaction),
                ]);
            }
        );
    }

    /**
     * 原子清除所有书籍、共享内容与进度，保留分类和应用元数据。
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
     * 一次读取书架摘要需要的三个 store，避免逐书查询和加载章节正文。
     */
    public async getBookSummaries(): Promise<BookSummary[]> {
        return TransactionManager.runTransaction(
            [bookStore.name, progressStore.name, tocStore.name],
            DatabaseMode.READ_ONLY,
            async (transaction) => {
                // 同一只读事务取得一致摘要，避免书籍和进度来自不同时间点。
                const [books, progress, tocs] = await Promise.all([
                    this.bookService.getAll(transaction),
                    this.progressService.getAll(transaction),
                    this.tocService.getAll(transaction),
                ]);

                // 预先索引进度与章数，组装书目时无需再次查询持久化层。
                const progressByBook = new Map(progress.map((item) => [item.bookId, item]));
                const chaptersByFile = new Map(tocs.map((toc) => [toc.fileId, toc.numberOfChapters()]));

                return books
                    .toSorted((a, b) => a.createdTime - b.createdTime)
                    .map((book) => {
                        const position = progressByBook.get(book.id);
                        const chapters = chaptersByFile.get(book.fileId);
                        return {
                            book,
                            title: book.fileName.replace(/\.txt$/i, ""),
                            progress:
                                position && chapters
                                    ? `第 ${String(position.chapterNumber)} / ${String(chapters)} 章`
                                    : "暂无阅读位置",
                        };
                    });
            }
        );
    }

    /**
     * 在同一事务内核实目标分类并移动书籍，保留阅读进度与共享正文。
     */
    public async moveBook(bookId: string, categoryId: string): Promise<void> {
        await TransactionManager.runTransaction(
            [bookStore.name, categoryStore.name],
            DatabaseMode.READ_WRITE,
            async (transaction) => {
                assertExists(await this.categoryService.getByKey(categoryId, transaction), "Category not found");
                const book = assertExists(await this.bookService.getByKey(bookId, transaction), "Book not found");
                await this.bookService.update(book.update({ categoryId, updatedTime: Date.now() }), transaction);
            }
        );
    }

    /**
     * 帮助入口按需恢复或更新内置手册，并返回刷新后的书籍 ID。
     */
    public async getHandbookId(metadata: Metadata, defaultCategory: Category): Promise<string> {
        await this.refreshHandbookIfNeeded(metadata, defaultCategory);
        return metadata.handbookBookId;
    }

    /**
     * 缺少应用元数据时先导入手册，再保存分类和引用该手册的元数据。
     * @returns 应用元数据与本次新建分类；已有实例的 categories 为 null，由调用方读取
     */
    private async seedDatabase() {
        // 元数据决定是否需要初始化，避免每次进入书架都重建预置内容。
        const metadata = await TransactionManager.runTransaction(
            [metadataStore.name],
            DatabaseMode.READ_ONLY,
            async (transaction) => await this.metadataService.getByField("appName", APP_NAME, transaction)
        );

        if (!metadata) {
            const categories = createCategorySeeds();

            // 文件读取和解析在初始化写事务外完成，避免事务因无待处理请求而结束。
            return await this.importBooks([createHandbookFile()], assertExists(categories[0]).id, false)
                .then(({ books }) => assertExists(books[0], "Handbook book not found"))
                .then(async (handbook) => {
                    // 手册导入成功后，再原子保存分类和引用该手册的元数据。
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
     * 按文件内容 hash 分组，逐个读取以限制大文件的并发内存占用。
     * @param files - 书籍文件列表
     * @param reportProgress - 可选的当前文件校验提示
     * @returns hash到同内容文件列表的映射
     */
    private async groupFilesByHash(files: File[], reportProgress?: (message: string) => void) {
        const groupedFiles = new Map<string, File[]>();
        for (const file of files) {
            reportProgress?.(`正在校验：${file.name}`);
            const hash = await FileUtil.computeHash(file);
            const grouped = groupedFiles.get(hash);
            if (grouped) grouped.push(file);
            else groupedFiles.set(hash, [file]);
        }
        return groupedFiles;
    }

    /**
     * 在写事务外解析同内容文件，并在单个事务内保存共享内容、书籍与初始进度。
     * @param hash - 文件内容hash
     * @param files - 内容相同的文件列表
     * @param categoryId - 书籍分类id
     * @param allowDuplicateBooks - 是否允许为同一内容创建多个书籍记录
     * @param reportProgress - 可选的编码识别、解析与保存阶段提示
     * @returns 该内容组导入成功的书籍、重复文件和编码不受支持文件
     */
    private async importContentGroup(
        hash: string,
        files: File[],
        categoryId: string,
        allowDuplicateBooks: boolean,
        reportProgress?: (message: string) => void
    ): Promise<BookImportResult> {
        const file = assertExists(files[0]);

        // BookFile 按 hash 唯一；已存在时直接复用其章节和目录，无需再次解析。
        let bookFile = await TransactionManager.runTransaction(
            bookFileStore.name,
            DatabaseMode.READ_ONLY,
            async (transaction) =>
                await this.bookFileService.getByIndex(bookFileStore.indexes.ukHash.name, hash, transaction)
        );

        const fileAlreadyExists = ObjectUtil.exists(bookFile);
        let bookData: { bookFile: BookFile; chapters: Chapter[]; toc: Toc } | null = null;

        // 只为新内容准备共享原文件、章节与目录；此时尚未开启写事务。
        if (!bookFile) {
            // 只解析组内第一个文件，其余文件与它内容完全相同。
            console.log(`Parsing new file with hash: ${hash}`);

            // 检测失败时跳过整组文件，避免持久化乱码。
            reportProgress?.(`正在识别编码：${file.name}`);
            const encoding = await this.textEncodingDetector.detect(file);
            if (!encoding) return { books: [], duplicateFiles: [], unsupportedEncodingFiles: files };

            // 原文件先取得共享标识，章节与目录均引用同一个 fileId。
            bookFile = new BookFile({
                id: crypto.randomUUID(),
                file,
                hash,
                createdTime: Date.now(),
                updatedTime: Date.now(),
            });

            // 检测失败已通过 null 分支跳过；解析阶段的其他异常继续向上抛出。
            reportProgress?.(`正在解析：${file.name}`);
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

        // 允许重复时每个文件都创建书籍；否则已有内容全部跳过，新内容只添加第一个文件。
        const filesForNewBooks = allowDuplicateBooks ? files : fileAlreadyExists ? [] : files.slice(0, 1);
        const bookEntries = filesForNewBooks.map((item) => {
            // 书名和分类属于独立书籍记录，正文仍引用组内共享内容。
            const book = new Book({
                id: crypto.randomUUID(),
                categoryId,
                fileId: assertExists(bookFile).id,
                fileName: item.name,
                createdTime: Date.now(),
                updatedTime: Date.now(),
            });

            // 每本书建立独立初始进度，重复导入不共享阅读位置。
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

        // filesForNewBooks 之外的文件均属于本次未添加的重复项。
        const duplicateFiles = allowDuplicateBooks ? [] : files.slice(filesForNewBooks.length);

        if (bookEntries.length === 0) return { books: [], duplicateFiles, unsupportedEncodingFiles: [] };

        // 共享内容与本组所有书籍、进度在同一写事务内提交或回滚。
        reportProgress?.(`正在保存：${file.name}`);
        await TransactionManager.runTransaction(
            [
                // 新内容需要写入原文件、章节和目录；已有内容只新增书籍及进度。
                ...(bookData ? [bookFileStore.name, chapterStore.name, tocStore.name] : []),
                bookStore.name,
                progressStore.name,
            ],
            DatabaseMode.READ_WRITE,
            async (transaction) => {
                if (bookData) {
                    console.log(`Processing file with hash: ${hash}`);
                    // IndexedDB 会在同一事务内按提交顺序处理请求。先将请求全部入队可避免逐章
                    // await 带来的事件循环往返，同时仍保持不同文件依次解析和持久化。
                    await Promise.all([
                        this.bookFileService.add(bookData.bookFile, transaction),
                        this.chapterService.addAll(bookData.chapters, transaction),
                        this.tocService.add(bookData.toc, transaction),
                    ]);
                }

                // 同组书籍各自成对写入书籍与进度，沿用当前事务的原子性。
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
     * @see HANDBOOK_VERSION 当前内置手册版本
     */
    private async refreshHandbookIfNeeded(metadata: Metadata, defaultCategory: Category): Promise<void> {
        // 手册记录可能已被删除，存在性和内容版本分别核对。
        const handbookExists = ObjectUtil.exists(
            await TransactionManager.runTransaction(
                [bookStore.name],
                DatabaseMode.READ_ONLY,
                async (transaction) => await this.bookService.getByKey(metadata.handbookBookId, transaction)
            )
        );
        const isHandbookOutdated = metadata.handbookVersion !== HANDBOOK_VERSION;

        if (isHandbookOutdated || !handbookExists) {
            // 只替换元数据指向的内置手册，普通书籍仍由用户管理。
            if (isHandbookOutdated && handbookExists) await this.deleteBook(metadata.handbookBookId);

            await this.importBooks([createHandbookFile()], defaultCategory.id, true)
                .then(({ books }) => assertExists(books[0], "Handbook book not found"))
                .then(async (newHandbook) => {
                    // 新手册可用后再发布其 ID 和版本，不提前指向尚未导入的内容。
                    await TransactionManager.runTransaction(
                        [metadataStore.name],
                        DatabaseMode.READ_WRITE,
                        async (transaction) => {
                            await this.metadataService.update(
                                metadata.update({
                                    handbookBookId: newHandbook.id,
                                    handbookVersion: HANDBOOK_VERSION,
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
