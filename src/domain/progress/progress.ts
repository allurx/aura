/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 一本书的阅读位置；以 bookId 为主键，不与同正文的其他书籍共享。
 */
export default interface Progress {
    bookId: string;
    chapterNumber: number;

    // 从 1 开始的章内内容块；TXT 为原始行，EPUB 为结构块。
    blockNumber: number;

    // 内容块在视口上缘以下的剩余比例（0～1），用于恢复块内阅读位置。
    blockVisibleRatio: number;
}
