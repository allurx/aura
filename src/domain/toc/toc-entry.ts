/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 阅读单元的导航摘要；位置范围与 Chapter 一致。
 */
export default interface TocEntry {
    // 章节序号，从 1 开始。
    chapterNumber: number;

    title: string;
    // EPUB 内部链接使用的书内路径，不是网络 URL。
    path?: string;
    anchors?: string[];

    // 从 1 开始的全书位置。
    startPosition: number;

    // 阅读单元的结束位置；空文件为 0。
    endPosition: number;
}
