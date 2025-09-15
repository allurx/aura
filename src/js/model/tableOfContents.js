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
 * 目录
 * @author allurx
 */
export default class TableOfContents {

    /** @type {number} */
    id;

    /** @type {number} */
    bookId;

    /** @type {Array<TableOfContents.Content>} */
    contents;

    /**
     * @param {Object} data - 目录数据
     * @property {number} bookId - 书籍id
     * @property {Array<Object>} contents - 目录内容
     */
    constructor({ id, bookId, contents }) {
        this.id = id;
        this.bookId = bookId;
        this.contents = contents;
    }

    /**
     * 目录内容
     */
    static Content = class {

        /** @type {number} */
        index;

        /** @type {string} */
        title;

        /** 
         * @param {Object} data - 目录内容数据
         * @property {number} index - 目录索引
         * @property {string} title - 目录标题
         */
        constructor({ index, title }) {
            this.index = index;
            this.title = title;
        }
    }

}