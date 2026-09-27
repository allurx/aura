/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { SupportedTextEncoding } from "./text-encoding";

/**
 * 按已确认编码流式读取TXT文件，向ChapterService提供稳定文本行。
 * @author allurx
 */
export default class TextFileReader {
    // 已通过全文件验证的编码。
    private readonly encoding: SupportedTextEncoding;

    /**
     * 创建文本文件读取器。
     * @param encoding - 已确认的文件编码
     */
    public constructor(encoding: SupportedTextEncoding) {
        this.encoding = encoding;
    }

    /**
     * 严格解码整个文件，非法字节返回false，其他读取错误继续抛出。
     * @param file - 待验证的TXT文件
     * @param encoding - 候选编码
     * @returns 整个文件能否按候选编码解码
     */
    public static async canDecode(file: File, encoding: SupportedTextEncoding): Promise<boolean> {
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
    public async *readLines(file: File): AsyncGenerator<string> {
        // 解码器处理字节与字符边界，本层只处理文本行边界。
        const reader = file
            .stream()
            .pipeThrough(new TextDecoderStream(this.encoding, { fatal: true }))
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
}
