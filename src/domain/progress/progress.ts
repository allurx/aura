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

    // 最后一次阅读快照的全书展示比例（0～1），不作为定位基准或历史最高进度。
    // 尚未记录时不展示；正常阅读保存后更新同一次快照。
    readingRatio?: number;
}

/**
 * 书架和阅读器共用紧凑的百分比，只有实际到达书尾才显示 100%。
 */
export function formatReadingProgress(ratio: number): string {
    const percentage = ratio === 1 ? 100 : Math.min(99.9, Math.round(ratio * 1000) / 10);
    return `${String(percentage)}%`;
}
