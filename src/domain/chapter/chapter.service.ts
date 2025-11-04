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

import Chapter from "./chapter.model";
import ChapterRepository from "./chapter.repository";
import { chapterStore } from "../../core/database/database-definition";
import { assertExists } from "../../core/util/assert.util";

/**
 * 章节服务
 * @author allurx
 */
export default class ChapterService {
    // 章节正则
    private readonly chapterRegex: RegExp =
        /(?:第[0-9一二三四五六七八九十百千万两]+[章卷]|卷[0-9一二三四五六七八九十百千万两]+)[-–—\s]*[^\r\n]*(?:\r?\n)?/g;

    // 换行符正则
    private readonly lineBreakRegex: RegExp = /\r?\n/;

    private readonly repository: ChapterRepository;

    constructor() {
        this.repository = new ChapterRepository();
    }

    /**
     * 批量添加章节
     * @param chapters - 章节数组
     * @param transaction - 事务对象
     */
    async addAll(chapters: Chapter[], transaction: IDBTransaction) {
        return await this.repository.addAll(chapters, transaction);
    }

    /**
     * 根据文件id删除章节
     * @param fileId - 所属文件id
     * @param transaction - 事务对象
     */
    async deleteByFileId(fileId: string, transaction: IDBTransaction) {
        await this.repository.deleteAllByIndex(chapterStore.indexes.idxFileId.name, fileId, transaction);
    }

    /**
     * 删除所有章节
     * @param transaction - 事务对象
     */
    async clear(transaction: IDBTransaction) {
        await this.repository.clear(transaction);
    }

    /**
     * 根据文件id和章节索引获取章节
     * @param fileId - 文件id
     * @param index - 章节索引
     * @param transaction - 事务对象
     * @return 章节
     */
    async getByFileIdAndIndex(fileId: string, index: number, transaction: IDBTransaction) {
        return await this.repository.getByIndex(chapterStore.indexes.ukFileIdIndex.name, [fileId, index], transaction);
    }

    /**
     * 解析章节
     * @param file - 上传的文件
     * @param fileId - 文件id
     * @returns 章节列表
     */
    async parseChapters(file: File, fileId: string): Promise<Chapter[]> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const chapters = [];
                const text = reader.result as string;

                // 匹配常见章节格式,支持多种标题形式
                const matches = [...text.matchAll(this.chapterRegex)];

                // 当前处理到的行号
                let currentLineNumber = 1;

                // 没有匹配到章节,则全文件作为一个章节
                if (matches.length === 0) {
                    const lines = this.splitToLines(text);
                    chapters.push(
                        new Chapter({
                            id: crypto.randomUUID(),
                            fileId: fileId,
                            index: 1,
                            title: "全文",
                            lines: lines,
                            startLineNumber: currentLineNumber,
                            endLineNumber: currentLineNumber + lines.length - 1,
                        })
                    );
                    resolve(chapters);

                    // 匹配到章节
                } else {
                    // 如果开头有介绍文字(第一个章节前有内容)
                    const firstMatch = assertExists(matches[0]);
                    if (firstMatch.index > 0) {
                        const preface = text.slice(0, firstMatch.index);
                        const lines = this.splitToLines(preface);
                        chapters.push(
                            new Chapter({
                                id: crypto.randomUUID(),
                                fileId: fileId,
                                index: 1,
                                title: "前言",
                                lines: lines,
                                startLineNumber: currentLineNumber,
                                endLineNumber: currentLineNumber + lines.length - 1,
                            })
                        );
                        currentLineNumber += lines.length;
                    }

                    // 遍历每个章节匹配
                    matches.forEach((match, i) => {
                        const chapterTitle = match[0];
                        const start = match.index + chapterTitle.length;
                        const end = i < matches.length - 1 ? matches[i + 1]?.index : text.length;
                        const content = text.slice(start, end);
                        const lines = this.splitToLines(content);
                        chapters.push(
                            new Chapter({
                                id: crypto.randomUUID(),
                                fileId: fileId,
                                index: chapters.length + 1,
                                title: chapterTitle.trim(),
                                lines: lines,
                                startLineNumber: currentLineNumber,
                                // 结束行号 = 起始行号 + 标题行数 + 内容行数 - 1
                                endLineNumber: currentLineNumber + lines.length,
                            })
                        );
                        currentLineNumber += lines.length + 1;
                    });
                    resolve(chapters);
                }
            };

            reader.onerror = reject;
            reader.readAsText(file, "UTF-8");
        });
    }

    /**
     * 按换行符切分文本,保证行数正确
     * - 保留中间的空行
     * - 去掉末尾因为换行导致的无效空行
     * @param text - 原始文本
     * @returns 切分后的行数组
     */
    private splitToLines(text: string): string[] {
        if (!text) return [];
        const lines = text.split(this.lineBreakRegex);
        // 如果最后一行是空字符串,说明原文是以换行符结尾,去掉
        if (lines.length > 1 && lines[lines.length - 1] === "") {
            lines.pop();
        }
        return lines;
    }
}
