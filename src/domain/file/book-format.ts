/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

export type BookFormat = "txt" | "epub";

export const BOOK_FILE_ACCEPT = ".txt,.epub";

/**
 * 文件扩展名用于选择解析器；实际内容仍由各解析器验证。
 */
export function getBookFormat(name: string): BookFormat | undefined {
    const dot = name.lastIndexOf(".");
    if (dot < 0) return undefined;
    const extension = name.slice(dot + 1).toLowerCase();
    if (extension === "txt" || extension === "epub") return extension;
    return undefined;
}

/**
 * 书名沿用用户的文件名，只去掉支持的格式后缀。
 */
export function getBookTitle(name: string): string {
    return name.replace(/\.(?:txt|epub)$/i, "");
}
