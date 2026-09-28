/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 以正文标识和章节序号共同定位的章节。
 */
export default interface Chapter {
    fileId: string;
    chapterNumber: number;
    title: string;
    lines: string[];

    // 本章节在整本书中的起始物理行号
    startBookLineNumber: number;

    // 本章节在整本书中的结束物理行号
    endBookLineNumber: number;
}

/**
 * 将从 1 开始的章节正文行号转换为全书物理行号，保留标题行占用的位置。
 */
export function toBookLineNumber(chapter: Chapter, chapterLineNumber: number): number {
    return chapter.endBookLineNumber - chapter.lines.length + chapterLineNumber;
}
