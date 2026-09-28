/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SupportedTextEncoding } from "./text-encoding";

/**
 * 严格解码整个文件，非法字节返回false，其他读取错误继续抛出。
 * @param file - 待验证的TXT文件
 * @param encoding - 候选编码
 * @returns 整个文件能否按候选编码解码
 */
export async function canDecode(file: File, encoding: SupportedTextEncoding): Promise<boolean> {
    // 严格解码整条流，不保留已验证的文本块。
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
 * 流式按行读取，保留空行和物理行号，仅移除CRLF中的CR。
 * @param file - 已通过编码验证的TXT文件
 * @returns 按原文件顺序产生文本行的异步迭代器
 */
export async function* readLines(file: File, encoding: SupportedTextEncoding): AsyncGenerator<string> {
    // 解码器处理字节与字符边界，本层只处理文本行边界。
    const reader = file
        .stream()
        .pipeThrough(new TextDecoderStream(encoding, { fatal: true }))
        .getReader();

    // 缓存当前块末尾尚未形成完整行的文本。
    let remaining = "";

    try {
        for (;;) {
            const result = await reader.read();
            if (result.done) break;

            // 字符边界由TextDecoderStream处理，这里只拼接跨块文本行。
            const text = remaining + result.value;
            let start = 0;
            let end = text.indexOf("\n");
            while (end >= 0) {
                const line = text.slice(start, end);
                // 只移除CRLF中的CR，保留其他独立CR。
                yield line.endsWith("\r") ? line.slice(0, -1) : line;
                start = end + 1;
                end = text.indexOf("\n", start);
            }

            // 将最后一个不完整行留给下一文本块。
            remaining = text.slice(start);
        }

        // 结尾换行不额外生成空行。
        if (remaining.length > 0) yield remaining;
    } finally {
        reader.releaseLock();
    }
}
