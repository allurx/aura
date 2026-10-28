/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BookFormat } from "./book-format";

export const MAX_BOOK_FILE_BYTES = 256 * 1024 * 1024;

/**
 * 导入入口与归档读取共用文件预算，在整文件读取或 hash 前即可拒绝超限输入。
 */
export function getBookSizeRejection(size: number, format: BookFormat): string | undefined {
    if (size > MAX_BOOK_FILE_BYTES)
        return `${format.toUpperCase()} 文件超过 ${String(MAX_BOOK_FILE_BYTES / (1024 * 1024))} MiB 的导入限制。请使用分卷版本。`;
    return undefined;
}
