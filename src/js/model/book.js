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

    id;
    genreId;
    hash;
    fileName;
    title;

    constructor({ id, genreId, hash, fileName, title }) {
        this.id = id;
        this.genreId = genreId;
        this.hash = hash;
        this.fileName = fileName;
        this.title = title;
    }

    // 静态工厂方法
    static async create(file, genreId) {
        const id = crypto.randomUUID();
        const hash = await Book.hash(file);
        const title = file.name.substring(0, file.name.lastIndexOf("."));
        return new Book({ id, genreId, hash, fileName: file.name, title })
    }

    // 计算文件的SHA-256哈希值
    // crypto.subtle需要确保页面是https协议或者本地通过http://localhost调试才可用
    static async hash(file) {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    // 生成书籍元素的html模板
    template() {
        return `
            <div id="${this.id}" class="book">
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