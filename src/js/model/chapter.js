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
    static CHAPTER_REGEX =
        /(?:第[0-9一二三四五六七八九十百千万两]+[章卷]|卷[0-9一二三四五六七八九十百千万两]+)[\-–—\s]*[^\r\n]*(?:\r?\n)?/g;

    /** @type {RegExp} */
    static LINE_BREAK_REGEX = /\r?\n/;

    /** @type {number} */
    id;

    /** @type {number} */
    bookId;

    /** @type {number} */
    index;

    /** @type {string} */
    title;

    /** @type {string[]} */
    lines;

    /** 
     * 本章节在整本书的起始行号
     * @type {number}  
     */
    startLineNumber;

    /** 
     * 本章节在整本书的结束行号
     * @type {number}  
     */
    endLineNumber;

    /**
     * @param {Object} data - 章节数据
     * @property {number} id - 章节id
     * @property {number} index - 章节索引
     * @property {number} bookId - 书籍id
     * @property {string} title - 章节标题
     * @property {string[]} lines - 章节内容行
     * @property {number} startLineNumber - 章节起始行号
     * @property {number} endLineNumber - 章节结束行号
     */
    constructor({ id, bookId, index, title, lines, startLineNumber, endLineNumber }) {
        this.id = id;
        this.bookId = bookId;
        this.index = index;
        this.title = title;
        this.lines = lines;
        this.startLineNumber = startLineNumber;
        this.endLineNumber = endLineNumber;
    }

    /**
     * 章节内容
     * @return {string} 整个章节内容
     */
    get content() {
        return this.lines.join("\n");
    }

    /**
     * 将行渲染为p元素
     * @param {HTMLElement} container - 容器
     */
    renderParagraph(container) {
        container.innerHTML = "";
        const fragment = document.createDocumentFragment();
        this.lines.forEach((line, index) => {
            const p = document.createElement("p");
            p.dataset.index = index + 1;
            p.textContent = line;
            fragment.appendChild(p);
        });
        container.appendChild(fragment);
    }

    /**
     * 渲染标题
     * @param {HTMLElement} container - 容器
     */
    renderTitle(container) {
        container.textContent = this.title;
    }

    /**
     * 按换行符切分文本,保证行数正确
     * - 保留中间的空行
     * - 去掉末尾因为换行导致的无效空行
     * @param {string} text - 原始文本
     * @returns {string[]} 切分后的行数组
     */
    static splitToLines(text) {
        if (!text) return [];
        const lines = text.split(/\r?\n/);
        // 如果最后一行是空字符串,说明原文是以换行符结尾,去掉
        if (lines.length > 1 && lines[lines.length - 1] === "") {
            lines.pop();
        }
        return lines;
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

                // 匹配常见章节格式,支持多种标题形式
                const matches = [...text.matchAll(Chapter.CHAPTER_REGEX)];

                // 当前处理到的行号
                let currentLineNumber = 1;

                // 没有匹配到章节,则全文件作为一个章节
                if (matches.length === 0) {
                    const lines = Chapter.splitToLines(text);
                    chapters.push(new Chapter({
                        index: 1,
                        title: "全文",
                        lines: lines,
                        startLineNumber: currentLineNumber,
                        endLineNumber: currentLineNumber + lines.length - 1
                    }));
                    resolve(chapters);
                    return;
                }

                // 如果开头有介绍文字(第一个章节前有内容)
                if (matches[0].index > 0) {
                    const preface = text.slice(0, matches[0].index);
                    const lines = Chapter.splitToLines(preface);
                    chapters.push(new Chapter({
                        index: 1,
                        title: "前言",
                        lines: lines,
                        startLineNumber: currentLineNumber,
                        endLineNumber: currentLineNumber + lines.length - 1
                    }));
                    currentLineNumber += lines.length;
                }

                // 遍历每个章节匹配
                matches.forEach((match, i) => {
                    const chapterTitle = match[0];
                    const start = match.index + chapterTitle.length;
                    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
                    const content = text.slice(start, end);
                    const lines = Chapter.splitToLines(content);
                    chapters.push(new Chapter({
                        index: chapters.length + 1,
                        title: chapterTitle.trim(),
                        lines: lines,
                        startLineNumber: currentLineNumber,
                        // 结束行号 = 起始行号 + 标题行数 + 内容行数 - 1
                        endLineNumber: currentLineNumber + lines.length
                    }));
                    currentLineNumber += lines.length + 1;
                });

                resolve(chapters);
            };

            reader.onerror = reject;
            reader.readAsText(file, "UTF-8");
        });
    }

}