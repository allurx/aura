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
 * 目录
 * @author allurx
 */
export default class TableOfContents extends BaseModel {

    /** @type {string} */
    fileId;

    /** @type {Array<TableOfContents.Content>} */
    contents;

    /**
     * @param {Object} data - 目录数据
     * @property {string} id - 目录id
     * @property {string} fileId - 所属文件id
     * @property {Array<Object>} contents - 目录内容
     */
    constructor({ id, fileId, contents }) {
        super();
        this.id = id;
        this.fileId = fileId;
        this.contents = contents.map(content => new TableOfContents.Content(content));
    }

    get numberOfChapters() {
        return this.contents.length;
    }

    get numberOfLines() {
        return this.contents[this.contents.length - 1].endLineNumber;
    }

    /**
     * 目录内容
     */
    static Content = class Content {

        /** @type {number} */
        index;

        /** @type {string} */
        title;

        /** @type {number} */
        startLineNumber;

        /** @type {number} */
        endLineNumber;

        /** 
         * @param {Object} data - 目录内容数据
         * @property {number} index - 目录索引
         * @property {string} title - 目录标题
        *  @property {number} startLineNumber - 章节起始行号
        *  @property {number} endLineNumber - 章节结束行号
         */
        constructor({ index, title, startLineNumber, endLineNumber }) {
            this.index = index;
            this.title = title;
            this.startLineNumber = startLineNumber;
            this.endLineNumber = endLineNumber;
        }
    }

}