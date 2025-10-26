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

import BaseModel from "./baseModel.js";

/**
 * 章节
 * @author allurx
 */
export default class Chapter extends BaseModel {

    /** @type {string} */
    fileId;

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
     * @property {string} id - 章节id
     * @property {string} fileId - 所属文件id
     * @property {number} index - 章节索引
     * @property {string} title - 章节标题
     * @property {string[]} lines - 章节内容行
     * @property {number} startLineNumber - 章节起始行号
     * @property {number} endLineNumber - 章节结束行号
     */
    constructor({ id, fileId, index, title, lines, startLineNumber, endLineNumber }) {
        super();
        this.id = id;
        this.fileId = fileId;
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

}