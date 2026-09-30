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

    let remaining = "";

    try {
        for (;;) {
            const result = await reader.read();
            if (result.done) break;

            // 将上一块的未结束行拼回当前块，再按换行符切分。
            const text = remaining + result.value;
            let start = 0;
            let end = text.indexOf("\n");
            while (end >= 0) {
                const line = text.slice(start, end);
                yield line.endsWith("\r") ? line.slice(0, -1) : line;
                start = end + 1;
                end = text.indexOf("\n", start);
            }

            // 将最后一个不完整行留给下一文本块。
            remaining = text.slice(start);
        }

        if (remaining.length > 0) yield remaining;
    } finally {
        reader.releaseLock();
    }
}
