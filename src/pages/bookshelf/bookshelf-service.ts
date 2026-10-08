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
import { getBookFormat, getBookTitle, type BookFormat } from "@/domain/file/book-format";
import { parseEpub, EpubImportError } from "@/domain/file/epub";
import { getEpubSizeRejection } from "@/domain/file/epub-limits";
import { computeHash } from "@/utils/file-util";
import { assertExists } from "@/utils/assert-util";
import { runTransaction } from "@/database/transaction";
import type { StoreName } from "@/database/database-schema";
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
} from "@/database/store";

/**
 * 批量导入的已完成结果；同内容文件各自创建书籍和阅读进度。
 */
export interface BookImportResult {
    books: Book[];
    // 已知的输入问题只跳过对应文件，不中断其他格式的导入。
    rejectedFiles: { file: File; reason: string }[];
}

/**
 * 书架所需的只读摘要快照，不加载章节正文；领域变化后以新快照替换。
 */
export interface BookSummary {
    readonly book: Readonly<Book>;
    readonly title: string;
    readonly progress: Readonly<{ chapterNumber: number; chapterCount: number }> | null;
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
 * 写事务外完成解析的正文。
 */
interface PreparedFile {
    file: BookFile;
    chapters: Chapter[];
}

/**
 * 按格式和内容分组导入，每组独立提交；已知输入问题跳过，其他异常中断批次。
 * @throws {BookImportError} 保留已完成结果与未完成文件，cause 指向原始异常。
 */
export async function importBooks(
    files: File[],
    categoryId: string,
    reportProgress?: (message: string) => void
): Promise<BookImportResult> {
    const result: BookImportResult = { books: [], rejectedFiles: [] };
    const unfinishedFiles = new Set(files);

    try {
        const category = assertExists(getCategory(categoryId), "Category not found");
        // 文件级拒绝在内容读取前完成，不阻止同一批次中可接受的输入。
        const importableFiles: File[] = [];
        for (const file of files) {
            const format = getBookFormat(file.name);
            const rejection = !format
                ? "格式不支持（支持 TXT、EPUB）"
                : format === "epub"
                  ? getEpubSizeRejection(file.size)
                  : undefined;
            if (rejection) {
                result.rejectedFiles.push({ file, reason: rejection });
                unfinishedFiles.delete(file);
            } else {
                importableFiles.push(file);
            }
        }

        for (const { hash, format, files: groupedFiles } of await groupFilesByHash(importableFiles, reportProgress)) {
            const file = assertExists(groupedFiles[0]);
            reportProgress?.(`正在保存：${file.name}`);
            const existingBooks = await saveBooks(groupedFiles, category.id, format, hash);
            if (existingBooks) {
                result.books.push(...existingBooks);
            } else {
                const prepared = await prepareFile(file, format, hash, reportProgress);
                if (typeof prepared === "string") {
                    result.rejectedFiles.push(...groupedFiles.map((file) => ({ file, reason: prepared })));
                } else {
                    reportProgress?.(`正在保存：${file.name}`);
                    const books = await saveBooks(groupedFiles, category.id, format, hash, prepared);
                    result.books.push(...assertExists(books));
                }
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
        if ((await countRecordsByIndex(transaction, "book", "byFileId", book.fileId)) === 1) {
            await Promise.all([
                deleteRecord(transaction, "file", book.fileId),
                deleteRecord(transaction, "toc", book.fileId),
                deleteRecordsByIndex(transaction, "chapter", "byFileId", book.fileId),
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
                    title: getBookTitle(book.fileName),
                    progress:
                        position && chapters ? { chapterNumber: position.chapterNumber, chapterCount: chapters } : null,
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
 * 原子读取导入时的文件名与原始字节，导出不依赖章节重建或文本重编码。
 */
export async function getBookExport(bookId: string): Promise<{ name: string; source: Blob }> {
    return runTransaction(["book", "file"], "readonly", async (transaction) => {
        const book = assertExists(await getRecord(transaction, "book", bookId), "Book not found");
        const file = assertExists(await getRecord(transaction, "file", book.fileId), "Book source not found");
        return { name: book.fileName, source: file.source };
    });
}

/**
 * 按内容 hash 分组，逐个读取以限制大文件的并发内存占用。
 */
async function groupFilesByHash(files: File[], reportProgress?: (message: string) => void) {
    const groupedFiles = new Map<string, { hash: string; format: BookFormat; files: File[] }>();
    for (const file of files) {
        reportProgress?.(`正在校验：${file.name}`);
        const hash = await computeHash(file);
        const format = assertExists(getBookFormat(file.name), "Unsupported book format");
        const key = `${format}:${hash}`;
        const grouped = groupedFiles.get(key);
        if (grouped) grouped.files.push(file);
        else groupedFiles.set(key, { hash, format, files: [file] });
    }
    return groupedFiles.values();
}

/**
 * 各格式在事务外解析；只把明确的输入错误转换为文件级拒绝原因。
 */
async function prepareFile(
    file: File,
    format: BookFormat,
    hash: string,
    reportProgress?: (message: string) => void
): Promise<PreparedFile | string> {
    const id = crypto.randomUUID();
    reportProgress?.(`正在解析：${file.name}`);
    if (format === "txt") {
        reportProgress?.(`正在识别编码：${file.name}`);
        const encoding = await detectTextEncoding(file);
        if (!encoding) return "编码无法可靠识别或不受支持，可另存为 UTF-8 后重试";
        return { file: { id, hash, format, source: file.slice() }, chapters: await parseChapters(file, id, encoding) };
    }

    let publication;
    try {
        publication = await parseEpub(file);
    } catch (error) {
        if (error instanceof EpubImportError) return error.message;
        throw error;
    }
    let position = 1;
    const chapters: Chapter[] = publication.sections.map((section, index) => {
        const chapter: Chapter = {
            kind: "epub",
            fileId: id,
            chapterNumber: index + 1,
            title: section.title,
            path: section.path,
            anchors: section.anchors,
            ...(section.startAnchors ? { startAnchors: section.startAnchors } : {}),
            blocks: section.blocks,
            startPosition: position,
            endPosition: position + section.blocks.length - 1,
        };
        position = chapter.endPosition + 1;
        return chapter;
    });
    return { file: { id, hash, format, source: file.slice(), resources: publication.resources }, chapters };
}

/**
 * 在同一写事务中核实正文并创建书籍引用；正文不存在且尚未解析时返回 null。
 * 解析期间其他页面可能导入或删除相同内容，最终写入必须重新按 hash 核对。
 */
async function saveBooks(
    files: File[],
    categoryId: CategoryId,
    format: BookFormat,
    hash: string,
    prepared?: PreparedFile
) {
    const storeNames: StoreName[] = prepared
        ? ["file", "chapter", "toc", "book", "progress"]
        : ["file", "book", "progress"];
    return runTransaction(storeNames, "readwrite", async (transaction) => {
        const existing = await getRecordByIndex(transaction, "file", "byFormatAndHash", [format, hash]);
        if (existing) return addBooks(files, categoryId, existing, transaction);
        if (!prepared) return null;

        await savePreparedFile(prepared, transaction);
        return addBooks(files, categoryId, prepared.file, transaction);
    });
}

/**
 * 新正文、全部章节和轻量目录一起写入；已有正文不重复写入。
 */
async function savePreparedFile(prepared: PreparedFile, transaction: IDBTransaction): Promise<void> {
    const toc: Toc = {
        fileId: prepared.file.id,
        entries: prepared.chapters.map((chapter) => ({
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            startPosition: chapter.startPosition,
            endPosition: chapter.endPosition,
            ...(chapter.kind === "epub" ? { path: chapter.path, anchors: chapter.anchors } : {}),
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
    source: BookFile,
    transaction: IDBTransaction
): Promise<Book[]> {
    const books: Book[] = [];
    for (const file of files) {
        const book: Book = {
            id: crypto.randomUUID(),
            categoryId,
            fileId: source.id,
            fileName: file.name,
            createdTime: Date.now(),
        };
        const progress: Progress = {
            bookId: book.id,
            chapterNumber: 1,
            blockNumber: 1,
            contentOffset: 0,
        };
        await Promise.all([addRecord(transaction, "book", book), addRecord(transaction, "progress", progress)]);
        books.push(book);
    }
    return books;
}
