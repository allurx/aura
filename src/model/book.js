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
import FileUtil from "../util/fileUtil.js";

/**
 * 书籍
 * @author allurx
 */
export default class Book extends BaseModel {

    /** @type {string} */
    fileId;

    /** @type {number} */
    genreId;

    /** @type {string} */
    hash;

    /** @type {string} */
    name;

    /** @type {number} */
    createdTime;

    get title() {
        return FileUtil.extractTitle(this.name);
    }

    /**
     * @param {Object} data - 书籍数据
     * @property {string} id - 书籍id
     * @property {string} fileId - 书籍文件id
     * @property {number} genreId - 书籍类型id
     * @property {string} hash - 文件哈希值
     * @property {string} name - 文件名
     * @property {number} createdTime - 创建时间
     */
    constructor({ id, fileId, genreId, hash, name, createdTime }) {
        super();
        this.id = id;
        this.fileId = fileId;
        this.genreId = genreId;
        this.hash = hash;
        this.name = name;
        this.createdTime = createdTime;
    }

    /**
     * 生成书籍元素的html模板
     * @returns {string} 书籍元素的html模板
     */
    template() {
        return `
            <div data-id="${this.id}" class="book">
                <div class="book-header">
                    <span class="book-delete-btn">✖</span>
                </div>
                <div class="book-body">
                    <span class="book-title">${this.title}</span>
                </div>
                <div class="book-footer"></div>
            </div>
            `;
    }

}