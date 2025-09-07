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

import ReaderSetting from "./model/readerSetting.js"
import ReaderTheme from "./model/readerTheme.js"
import Database from "./database/database.js"

/**
 * Aura
 * @author allurx
 */
export default class Aura {

    /**
     * 数据库属性
     */
    static databaseProperties = {
        name: "Aura",
        version: 3,
        stores: {
            book: {
                name: "book",
                keyPath: "id",
                autoIncrement: true,
                indexes: {
                    genreId: { name: "genre_id", path: "genreId", unique: false }
                },
                description: "书籍"
            },
            tableOfContents: {
                name: "table_of_contents",
                keyPath: "id",
                autoIncrement: true,
                indexes: {
                    bookId: { name: "book_id", path: "bookId", unique: true }
                },
                description: "书籍目录"
            },
            chapter: {
                name: "chapter",
                keyPath: "id",
                autoIncrement: true,
                indexes: {
                    bookId: { name: "book_id", path: "bookId", unique: false },
                    chapterId: { name: "chapter_id", path: ["bookId", "index"], unique: true },
                },
                description: "书籍章节"
            },
            readingProgress: {
                name: "reading_progress",
                keyPath: "id",
                autoIncrement: true,
                indexes: {
                    bookId: { name: "book_id", path: "bookId", unique: true }
                },
                description: "书籍阅读进度"
            },
            setting: {
                name: "setting",
                keyPath: "id",
                autoIncrement: true,
                indexes: {
                    name: { name: "name", path: "name", unique: true }
                },
                description: "设置"
            }
        }
    };

    /**
     * 阅读器配置数据
     */
    static reader = {
        setting: new ReaderSetting({
            id: 1,
            name: "reader-setting",
            theme: "yellow",
            fontSize: 18,
            fontColor: "#000000",
            pageWidth: window.innerWidth > 768 ? 800 : window.innerWidth,
            pagePadding: 30,
            lineHeight: 2,
            contentBackgroundColor: "#f2e8c8",
            backgroundColor: "#be966e"
        }),
        themes: [
            new ReaderTheme(1, "浅色", "light", "#000000", "#ffffff", "#ffffff"),
            new ReaderTheme(2, "昏暗", "dim", "#e3e3e3", "#111a2e", "#111a2e"),
            new ReaderTheme(3, "深色", "dark", "#e3e3e3", "#202124", "#202124"),
            new ReaderTheme(4, "黄色", "yellow", "#000000", "#f2e8c8", "#be966e"),
            new ReaderTheme(5, "蓝色", "blue", "#000000", "#d2e3fc", "#d2e3fc"),
            new ReaderTheme(6, "灰色", "grey", "#e3e3e3", "#3c3c3c", "#3c3c3c")
        ]
    }

    /**
     * 数据库实例
     * @type {Database}
     */
    static database = new Database(Aura.databaseProperties.name, Aura.databaseProperties.version, Aura.databaseProperties.stores);

}