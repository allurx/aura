/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Progress from "@/domain/progress/progress";
import { getRecord, putRecord } from "@/database/store";
import { runTransaction } from "@/database/transaction";
import type ReaderState from "./reader-state";
import { assertExists } from "@/utils/assert-util";

/**
 * 在同一事务快照中加载阅读上下文。书籍已删除时返回 undefined，其他记录缺失继续报错。
 */
export async function initReader(bookId: string): Promise<ReaderState | undefined> {
    return runTransaction(["book", "file", "toc", "progress"], "readonly", async (transaction) => {
        const [book, progress] = await Promise.all([
            getRecord(transaction, "book", bookId),
            getRecord(transaction, "progress", bookId),
        ]);
        if (!book) return undefined;
        const currentBook = book;
        const currentProgress = assertExists(progress, `Progress[bookId=${bookId}] not found`);

        // 原文件与目录依赖正文标识，实际章节由正文窗口按需读取。
        const [file, toc] = await Promise.all([
            getRecord(transaction, "file", currentBook.fileId),
            getRecord(transaction, "toc", currentBook.fileId),
        ]);
        return {
            book: currentBook,
            file: assertExists(file, `File[${currentBook.fileId}] not found`),
            progress: currentProgress,
            toc: assertExists(toc, `Toc[fileId=${currentBook.fileId}] not found`),
        };
    });
}

/**
 * 核实书籍仍存在后提交完整进度快照，避免另一页面删除后重新创建孤儿进度。
 * 书籍已删除时返回 false；真实事务失败继续抛出，由调用方反馈并保留原内存状态。
 */
export async function updateProgress(progress: Progress): Promise<boolean> {
    return runTransaction(["book", "progress"], "readwrite", async (transaction) => {
        if (!(await getRecord(transaction, "book", progress.bookId))) return false;
        await putRecord(transaction, "progress", progress);
        return true;
    });
}

/**
 * 获取指定章节，记录缺失时保留正文标识与章节序号。
 */
export async function getChapter(fileId: string, chapterNumber: number) {
    return assertExists(
        await runTransaction("chapter", "readonly", (transaction) =>
            getRecord(transaction, "chapter", [fileId, chapterNumber])
        ),
        `Chapter[fileId=${fileId}, chapterNumber=${String(chapterNumber)}] not found`
    );
}
