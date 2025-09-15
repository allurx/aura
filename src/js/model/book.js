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
 * 书籍
 * @author allurx
 */
export default class Book {

    /** @type {number} */
    id;

    /** @type {number} */
    genreId;

    /** @type {string} */
    hash;

    /** @type {string} */
    name;

    /**@type {string} */
    title;

    /** @type {number} */
    size;

    /** @type {number} */
    createdTime;

    /**
     * @param {Object} data - 书籍数据
     * @property {number} id - 书籍id
     * @property {number} genreId - 书籍类型id
     * @property {string} hash - 文件哈希值
     * @property {string} name - 文件名
     * @property {string} title - 书名
     * @property {number} size - 文件大小
     * @property {number} createdTime - 创建时间
     */
    constructor({ id, genreId, hash, name, title, size, createdTime }) {
        this.id = id;
        this.genreId = genreId;
        this.hash = hash;
        this.name = name;
        this.title = title;
        this.size = size;
        this.createdTime = createdTime;
    }

    /**
     * 创建书籍实例
     * @param {File} file - 上传的文件
     * @param {number} genreId - 书籍类型id
     * @param {Chapter[]} chapters - 章节列表
     * @returns {Promise<Book>} 书籍实例
     */
    static async create(file, genreId) {
        const hash = await Book.hash(file);
        const title = file.name.substring(0, file.name.lastIndexOf("."));
        return new Book({ genreId, hash, name: file.name, title, size: file.size, createdTime: Date.now() })
    }

    /**
     * 计算文件的SHA-256哈希值
     * 注意: crypto.subtle需要HTTPS协议或localhost环境
     * @param {File} file - 上传的文件
     * @returns {Promise<string>} 文件的SHA-256哈希值
     */
    static async hash(file) {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    /**
     * 生成书籍元素的html模板
     * @returns {string} 书籍元素的html模板
     */
    template() {
        return `
            <div data-id="${this.id}" class="book">
                <div class="book-header">
                    <span class="delete-book">✖</span>
                </div>
                <div class="book-body">
                    <span class="book-title">${this.title}</span>
                </div>
            </div>
            `;
    }

}