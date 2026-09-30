/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 计算文件的 SHA-256 哈希值；需一次读取完整文件，且 crypto.subtle 要求安全上下文。
 */
export async function computeHash(file: File): Promise<string> {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}
