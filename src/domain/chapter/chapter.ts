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
export function toBookPosition(chapter: Chapter, blockNumber: number, contentOffset: number): number {
    const length = chapter.kind === "text" ? chapter.lines.length : chapter.blocks.length;
    const contentLength =
        chapter.kind === "text"
            ? (chapter.lines[blockNumber - 1]?.length ?? 0)
            : countContentPositions(chapter.blocks[blockNumber - 1]);
    return chapter.endPosition - length + blockNumber - 1 + Math.min(1, contentOffset / Math.max(1, contentLength));
}

/**
 * 受控 EPUB 文本按 UTF-16 计数，媒体、换行和分隔线各占一个位置，与正文定位契约一致。
 */
function countContentPositions(node: EpubNode | undefined): number {
    if (!node) return 0;
    if (node.type === "text") return node.text.length;
    if (node.type === "image" || node.tag === "br" || node.tag === "hr") return 1;
    return node.children.reduce((count, child) => count + countContentPositions(child), 0);
}
