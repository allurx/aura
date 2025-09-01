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

/**
 * 章节
 * @author allurx
 */
export default class Chapter {

    /** @type {RegExp} */
    static CHAPTER_REGEX = /(第[0-9一二三四五六七八九十百千]+[章卷][\-–—\s]*[^\n]*)|(卷[0-9一二三四五六七八九十百千]+[\-–—\s]*[^\n]*)/g;

    /** @type {number} */
    id;

    /** @type {number} */
    bookId;

    /** @type {number} */
    index;

    /** @type {string} */
    title;

    /** @type {string} */
    content;

    /**
     * @param {Object} data - 章节数据
     * @property {number} id - 章节id
     * @property {number} index - 章节索引
     * @property {number} bookId - 书籍id
     * @property {string} title - 章节标题
     * @property {string} content - 章节内容
     */
    constructor({ id, bookId, index, title, content }) {
        this.id = id;
        this.bookId = bookId;
        this.index = index;
        this.title = title;
        this.content = content;
    }

    /**
     * 解析章节
     * @param {File} file - 上传的文件
     * @returns {Promise<Chapter[]>} 章节列表
     */
    static async parse(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {

                const chapters = [];
                const text = reader.result;

                // 匹配常见章节格式，支持多种标题形式
                const matches = [...text.matchAll(Chapter.CHAPTER_REGEX)];

                // 没有匹配到章节，则全文件作为一个章节
                if (matches.length === 0) {
                    chapters.push(new Chapter({ index: 0, title: "全文", content: text.trim() }));
                    resolve(chapters);
                    return;
                }

                // 如果开头有介绍文字（第一个章节前有内容）
                if (matches[0].index > 0) {
                    chapters.push(new Chapter({ index: chapters.length, title: "前言", content: text.slice(0, matches[0].index).trimStart() }));
                }

                // 遍历每个章节匹配
                matches.forEach((match, i) => {
                    const chapterTitle = match[0].trim();
                    const start = match.index + chapterTitle.length;
                    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
                    const content = text.slice(start, end).trimStart();
                    chapters.push(new Chapter({ index: chapters.length, title: chapterTitle, content }));
                });

                resolve(chapters);
            };

            reader.onerror = reject;
            reader.readAsText(file, "UTF-8");
        });
    }

}