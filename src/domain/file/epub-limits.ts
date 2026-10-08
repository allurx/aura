/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

export const MAX_EPUB_FILE_BYTES = 256 * 1024 * 1024;

/**
 * 导入入口与归档读取共用文件预算，在整文件读取或 hash 前即可拒绝超限输入。
 */
export function getEpubSizeRejection(size: number): string | undefined {
    if (size > MAX_EPUB_FILE_BYTES)
        return `EPUB 文件超过 ${String(MAX_EPUB_FILE_BYTES / (1024 * 1024))} MiB 的导入限制。`;
    return undefined;
}
