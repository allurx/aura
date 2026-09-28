/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Book from "@/domain/book/book";
import type BookFile from "@/domain/file/book-file";
import type Chapter from "@/domain/chapter/chapter";
import type Toc from "@/domain/toc/toc";
import type Progress from "@/domain/progress/progress";
import { getCategory, type CategoryId } from "@/domain/category/category";
import { parseChapters } from "@/domain/chapter/chapter-parser";
import { detectTextEncoding } from "@/domain/file/text-encoding-detector";
import { computeHash } from "@/utils/file-util";
import { assertExists } from "@/utils/assert-util";
import { runTransaction } from "@/database/transaction";
import {
    addRecord,
    clearRecords,
    countRecordsByIndex,
    deleteRecord,
    deleteRecordsByIndex,
    getAllRecords,
    getRecord,
    getRecordByIndex,
    putRecord,
    type StoreName,
} from "@/database/store";

/**
 * 批量导入的已完成结果；同内容文件各自创建书籍和阅读进度。
 */
export interface BookImportResult {
    books: Book[];
    // 编码无法可靠识别或严格解码，因而未持久化的文件。
    unsupportedEncodingFiles: File[];
}

/**
 * 书架所需摘要，不加载章节正文。
 */
export interface BookSummary {
    book: Book;
    title: string;
    progress: string;
}

/**
 * 批次中断时保留已完成结果、未完成文件与原始异常。
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
 * 写事务外准备的正文；已有内容无需再次解析，chapters 为 null。
 */
interface PreparedFile {
    file: BookFile;
    chapters: Chapter[] | null;
}

/**
 * 按内容分组导入，每组独立提交；编码不支持的组跳过，其他异常中断批次。
 * @throws {BookImportError} 保留已完成结果与未完成文件，cause 指向原始异常。
 */
export async function importBooks(
    files: File[],
    categoryId: string,
    reportProgress?: (message: string) => void
): Promise<BookImportResult> {
    const result: BookImportResult = { books: [], unsupportedEncodingFiles: [] };
    const unfinishedFiles = new Set(files);

    try {
        const category = assertExists(getCategory(categoryId), "Category not found");
        for (const [hash, groupedFiles] of await groupFilesByHash(files, reportProgress)) {
            const file = assertExists(groupedFiles[0]);
            const prepared = await prepareFile(file, hash, reportProgress);
            if (!prepared) {
                result.unsupportedEncodingFiles.push(...groupedFiles);
            } else {
                reportProgress?.(`正在保存：${file.name}`);
                const storeNames: StoreName[] = prepared.chapters
                    ? ["file", "chapter", "toc", "book", "progress"]
                    : ["book", "progress"];
                const books = await runTransaction(storeNames, "readwrite", async (transaction) => {
                    await savePreparedFile(prepared, transaction);
                    return addBooks(groupedFiles, category.id, prepared.file.id, transaction);
                });
                result.books.push(...books);
            }

            // 整组提交或明确跳过后，才从未完成集合移除。
            groupedFiles.forEach((item) => unfinishedFiles.delete(item));
        }
    } catch (error) {
        throw new BookImportError(result, [...unfinishedFiles], error);
    }
    return result;
}

/**
 * 删除书籍及进度，最后一本引用移除时才清理共享正文。
 */
export async function deleteBook(bookId: string): Promise<void> {
    await runTransaction(["file", "book", "chapter", "toc", "progress"], "readwrite", async (transaction) => {
        const book = assertExists(await getRecord(transaction, "book", bookId), `Book[${bookId}] not found`);
        if ((await countRecordsByIndex(transaction, "book", "fileId", book.fileId)) === 1) {
            await Promise.all([
                deleteRecord(transaction, "file", book.fileId),
                deleteRecord(transaction, "toc", book.fileId),
                deleteRecordsByIndex(transaction, "chapter", "fileId", book.fileId),
            ]);
        }
        await Promise.all([deleteRecord(transaction, "book", bookId), deleteRecord(transaction, "progress", bookId)]);
    });
}

/**
 * 原子清空全部书籍、共享正文和阅读进度。
 */
export async function clearBookshelf(): Promise<void> {
    const storeNames: StoreName[] = ["file", "book", "chapter", "toc", "progress"];
    await runTransaction(storeNames, "readwrite", async (transaction) => {
        await Promise.all(storeNames.map((store) => clearRecords(transaction, store)));
    });
}

/**
 * 一次读取书架摘要需要的记录，避免逐书查询和加载章节正文。
 */
export async function getBookSummaries(): Promise<BookSummary[]> {
    return runTransaction(["book", "progress", "toc"], "readonly", async (transaction) => {
        const [books, progress, tocs] = await Promise.all([
            getAllRecords(transaction, "book"),
            getAllRecords(transaction, "progress"),
            getAllRecords(transaction, "toc"),
        ]);
        const progressByBook = new Map(progress.map((item) => [item.bookId, item]));
        const chaptersByFile = new Map(tocs.map((toc) => [toc.fileId, toc.entries.length]));

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
    });
}

/**
 * 核实固定分类后原子更新书籍归属，保留独立进度和共享正文。
 */
export async function moveBook(bookId: string, categoryId: string): Promise<void> {
    const category = assertExists(getCategory(categoryId), "Category not found");
    await runTransaction("book", "readwrite", async (transaction) => {
        const book = assertExists(await getRecord(transaction, "book", bookId), "Book not found");
        await putRecord(transaction, "book", { ...book, categoryId: category.id });
    });
}

/**
 * 按内容 hash 分组，逐个读取以限制大文件的并发内存占用。
 */
async function groupFilesByHash(files: File[], reportProgress?: (message: string) => void) {
    const groupedFiles = new Map<string, File[]>();
    for (const file of files) {
        reportProgress?.(`正在校验：${file.name}`);
        const hash = await computeHash(file);
        const grouped = groupedFiles.get(hash);
        if (grouped) grouped.push(file);
        else groupedFiles.set(hash, [file]);
    }
    return groupedFiles;
}

/**
 * 复用已有正文，或在事务外完成严格编码检测和章节解析。
 */
async function prepareFile(
    file: File,
    hash: string,
    reportProgress?: (message: string) => void
): Promise<PreparedFile | null> {
    const existing = await runTransaction("file", "readonly", (transaction) =>
        getRecordByIndex(transaction, "file", "hash", hash)
    );
    if (existing) return { file: existing, chapters: null };

    reportProgress?.(`正在识别编码：${file.name}`);
    const encoding = await detectTextEncoding(file);
    if (!encoding) return null;

    const source: BookFile = { id: crypto.randomUUID(), hash };
    reportProgress?.(`正在解析：${file.name}`);
    return { file: source, chapters: await parseChapters(file, source.id, encoding) };
}

/**
 * 新正文、全部章节和轻量目录一起写入；已有正文不重复写入。
 */
async function savePreparedFile(prepared: PreparedFile, transaction: IDBTransaction): Promise<void> {
    if (!prepared.chapters) return;

    const toc: Toc = {
        fileId: prepared.file.id,
        entries: prepared.chapters.map(({ chapterNumber, title, startBookLineNumber, endBookLineNumber }) => ({
            chapterNumber,
            title,
            startBookLineNumber,
            endBookLineNumber,
        })),
    };
    // 全部请求一次入队，事务统一确认提交；目录显式投影，不能带入正文。
    await Promise.all([
        addRecord(transaction, "file", prepared.file),
        addRecord(transaction, "toc", toc),
        ...prepared.chapters.map((chapter) => addRecord(transaction, "chapter", chapter)),
    ]);
}

/**
 * 同内容文件各自创建书名、分类和初始进度，共享正文标识。
 */
async function addBooks(
    files: File[],
    categoryId: CategoryId,
    fileId: string,
    transaction: IDBTransaction
): Promise<Book[]> {
    const books: Book[] = [];
    for (const file of files) {
        const book: Book = {
            id: crypto.randomUUID(),
            categoryId,
            fileId,
            fileName: file.name,
            createdTime: Date.now(),
        };
        const progress: Progress = { bookId: book.id, chapterNumber: 1, chapterLineNumber: 1, lineVisibleRatio: 1 };
        await Promise.all([addRecord(transaction, "book", book), addRecord(transaction, "progress", progress)]);
        books.push(book);
    }
    return books;
}
