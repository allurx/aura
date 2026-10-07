/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EpubNode } from "@/domain/file/epub";

/**
 * 一次加载的章节；全书位置依次按 TXT 原始行或 EPUB 内容块累计。
 */
type Chapter = {
    fileId: string;
    chapterNumber: number;
    title: string;
    startPosition: number;
    endPosition: number;
} & ({ kind: "text"; lines: string[] } | { kind: "epub"; path: string; anchors: string[]; blocks: EpubNode[] });

export type { Chapter as default };

/**
 * 将章内内容块转换为全书位置；TXT 保留显式标题占用的物理行。
 */
export function toBookPosition(chapter: Chapter, blockNumber: number): number {
    const length = chapter.kind === "text" ? chapter.lines.length : chapter.blocks.length;
    return chapter.endPosition - length + blockNumber;
}
