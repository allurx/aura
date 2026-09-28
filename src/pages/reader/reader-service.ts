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
 * 在同一事务快照中加载完整阅读状态，必需记录缺失时保留错误上下文。
 */
export async function initReader(bookId: string): Promise<ReaderState> {
    return runTransaction(["book", "toc", "chapter", "progress"], "readonly", async (transaction) => {
        const [book, progress] = await Promise.all([
            getRecord(transaction, "book", bookId),
            getRecord(transaction, "progress", bookId),
        ]);
        const currentBook = assertExists(book, `Book[${bookId}] not found`);
        const currentProgress = assertExists(progress, `Progress[bookId=${bookId}] not found`);

        // 目录与目标章节依赖正文标识和进度，其余读取彼此独立。
        const [toc, chapter] = await Promise.all([
            getRecord(transaction, "toc", currentBook.fileId),
            getRecord(transaction, "chapter", [currentBook.fileId, currentProgress.chapterNumber]),
        ]);
        return {
            book: currentBook,
            progress: currentProgress,
            toc: assertExists(toc, `Toc[fileId=${currentBook.fileId}] not found`),
            chapter: assertExists(
                chapter,
                `Chapter[fileId=${currentBook.fileId}, chapterNumber=${String(currentProgress.chapterNumber)}] not found`
            ),
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
