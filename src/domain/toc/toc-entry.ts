/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 目录只保留导航所需字段，不包含章节正文。
 */
export default interface TocEntry {
    // 章节序号，从 1 开始
    chapterNumber: number;

    // 目录标题
    title: string;

    // 章节在整本书中的起始物理行号
    startBookLineNumber: number;

    // 章节在整本书中的结束物理行号
    endBookLineNumber: number;
}
