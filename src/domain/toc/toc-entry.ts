/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 章节的导航摘要；行号范围与 Chapter 一致，包含显式标题行。
 */
export default interface TocEntry {
    // 章节序号，从 1 开始。
    chapterNumber: number;

    title: string;

    // 从 1 开始的全书物理行号。
    startBookLineNumber: number;

    // 章节最后一行的全书物理行号；空文件为 0。
    endBookLineNumber: number;
}
