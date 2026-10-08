/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SupportedTextEncoding } from "./text-encoding";

/**
 * 严格解码整个文件，以流读取时的 TypeError 表示解码失败，其他异常继续抛出。
 * 验证时丢弃已解码的文本块，不在内存中累积全文。
 */
export async function canDecode(file: File, encoding: SupportedTextEncoding): Promise<boolean> {
    const reader = file
        .stream()
        .pipeThrough(new TextDecoderStream(encoding, { fatal: true }))
        .getReader();

    try {
        for (;;) {
            const result = await reader.read();
            if (result.done) return true;
        }
    } catch (error) {
        if (error instanceof TypeError) return false;
        throw error;
    } finally {
        reader.releaseLock();
    }
}

/**
 * 按 LF 流式分行，保留空行和独立 CR，仅移除 CRLF 中的 CR。
 * 文件末尾的换行不额外产生空行，调用方据此累计物理行号。
 *
 * @param encoding - 已通过全文件验证的编码
 */
export async function* readLines(file: File, encoding: SupportedTextEncoding): AsyncGenerator<string> {
    // 解码器处理字节与字符边界，本层只处理文本行边界。
    const reader = file
        .stream()
        .pipeThrough(new TextDecoderStream(encoding, { fatal: true }))
        .getReader();

    const fragments: string[] = [];

    try {
        for (;;) {
            const result = await reader.read();
            if (result.done) break;

            // 只扫描新到达的文本，避免长行在每次读取时重复拼接和扫描整个前缀。
            const text = result.value;
            let start = 0;
            let end = text.indexOf("\n");
            while (end >= 0) {
                const part = text.slice(start, end);
                let line = part;
                if (fragments.length > 0) {
                    fragments.push(part);
                    line = fragments.join("");
                    fragments.length = 0;
                }
                yield line.endsWith("\r") ? line.slice(0, -1) : line;
                start = end + 1;
                end = text.indexOf("\n", start);
            }

            // 未结束行保留分片，只在读到换行或文件结束时合并一次。
            if (start < text.length) fragments.push(text.slice(start));
        }

        if (fragments.length > 0) yield fragments.join("");
    } finally {
        reader.releaseLock();
    }
}
