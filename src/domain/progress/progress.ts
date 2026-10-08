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

    // 块内源内容偏移：文本按 UTF-16 长度累计，图片、换行与分隔线各占一个位置。
    // 不依赖排版后的像素、页码或段落高度，字体和视窗变化后仍定位同一内容。
    contentOffset: number;
}
