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

import BaseService from "../base-service";
import Chapter from "./chapter";
import ChapterRepository from "./chapter-repository";

/**
 * 章节服务
 * @author allurx
 */
export default class ChapterService extends BaseService<Chapter> {
    // 只匹配完整标题行,避免将正文中的章节编号或小数误判为标题
    private readonly chapterRegex: RegExp =
        /^[\t \u3000]*(?:第[0-9零〇一二三四五六七八九十百千万两]+[章卷]|卷[0-9零〇一二三四五六七八九十百千万两]+|\d+\.(?!\d))[-–—\t \u3000]*[^\r\n]*$/;

    public constructor() {
        super(new ChapterRepository());
    }

    /**
     * 解析章节
     * @param file - 上传的文件
     * @param fileId - 文件id
     * @returns 章节列表
     */
    public async parseChapters(file: File, fileId: string): Promise<Chapter[]> {
        const chapters: Chapter[] = [];
        let chapterTitle: string | null = null;
        let chapterLines: string[] = [];
        let currentLineNumber = 1;

        // 标题行不保存在lines中,但仍需计入章节在全书中的行号;前言和全文则没有标题行
        const appendChapter = (title: string, lines: string[], includesTitle: boolean) => {
            const chapter = new Chapter({
                id: crypto.randomUUID(),
                fileId,
                index: chapters.length + 1,
                title,
                lines,
                startLineNumber: currentLineNumber,
                endLineNumber: currentLineNumber + lines.length + Number(includesTitle) - 1,
                createdTime: Date.now(),
                updatedTime: Date.now(),
            });
            chapters.push(chapter);
            currentLineNumber = chapter.endLineNumber + 1;
        };

        for await (const line of this.readLines(file)) {
            // 普通行持续归入当前章节,直到遇到下一个标题
            if (!this.chapterRegex.test(line)) {
                chapterLines.push(line);
                continue;
            }

            // 遇到新标题时先封存上一段内容;首个标题之前的内容单独作为前言
            if (chapterTitle === null) {
                if (chapterLines.length > 0) appendChapter("前言", chapterLines, false);
            } else {
                appendChapter(chapterTitle, chapterLines, true);
            }
            chapterTitle = line.trim();
            chapterLines = [];
        }

        // 无标题文件整体作为全文;有标题文件则在文件结束时封存最后一章
        appendChapter(chapterTitle ?? "全文", chapterLines, chapterTitle !== null);
        return chapters;
    }

    /**
     * 分块读取文件并按行输出,避免一次性将全文解码到内存
     * @param file - 上传的文件
     * @returns 异步行迭代器
     */
    private async *readLines(file: File): AsyncGenerator<string> {
        const reader = file.stream().pipeThrough(new TextDecoderStream("UTF-8")).getReader();
        let remaining = "";
        try {
            for (;;) {
                const result = await reader.read();
                if (result.done) break;

                // UTF-8字符或文本行可能横跨两个数据块,先拼接上个数据块的残余内容
                const text = remaining + result.value;
                let start = 0;
                let end = text.indexOf("\n");
                while (end >= 0) {
                    const line = text.slice(start, end);
                    // 以\n分行时去掉CRLF中的\r,但保留正文中的独立\r
                    yield line.endsWith("\r") ? line.slice(0, -1) : line;
                    start = end + 1;
                    end = text.indexOf("\n", start);
                }
                remaining = text.slice(start);
            }
            // 文件以换行符结束时remaining为空,不会生成一个无效的尾部空行
            if (remaining.length > 0) yield remaining;
        } finally {
            reader.releaseLock();
        }
    }
}
