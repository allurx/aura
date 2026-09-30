/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 以正文标识和从 1 开始的章节序号共同定位的章节。
 * lines 保留原始空行，不包含已识别的章节标题行。
 */
export default interface Chapter {
    fileId: string;
    chapterNumber: number;
    title: string;
    lines: string[];

    // 从 1 开始的全书物理行号，包含显式标题行。
    startBookLineNumber: number;

    // 章节最后一行的全书物理行号；空文件为 0。
    endBookLineNumber: number;
}

/**
 * 将从 1 开始的章节正文行号转换为全书物理行号，保留标题行占用的位置。
 */
export function toBookLineNumber(chapter: Chapter, chapterLineNumber: number): number {
    return chapter.endBookLineNumber - chapter.lines.length + chapterLineNumber;
}
