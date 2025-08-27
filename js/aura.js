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

import Database from "./database/database.js"

export default class Aura {

    // 数据库属性
    static databaseProperties = {
        name: "Aura",
        version: 1,
        stores: {
            book: {
                name: "book",
                keyPath: "id",
                autoIncrement: false,
                indexes: {
                    genreId: { name: "genre_id", path: "genreId", unique: false }
                }
            },
            tableOfContents: {
                name: "table_of_contents",
                keyPath: "bookId",
                autoIncrement: false,
                indexes: {}
            },
            chapter: {
                name: "chapter",
                keyPath: ["bookId", "id"],
                autoIncrement: false,
                indexes: {
                    bookId: { name: "book_id", path: "bookId", unique: false },
                }
            },
            readingProgress: {
                name: "reading_progress",
                keyPath: "bookId",
                autoIncrement: false,
                indexes: {}
            },
            setting: {
                name: "setting",
                keyPath: "id",
                autoIncrement: false,
                indexes: {}
            },
        }
    };

    // 阅读设置
    static reader = {
        setting: {
            id: "reader-setting",
            theme: "day",
            fontSize: 18,
            fontColor: "#000000",
            pageWidth: window.screen.width > 768 ? 800 : window.screen.width,
            pagePadding: 30,
            lineHeight: 2,
            backgroundColor: "#be966e",
            contentBackgroundColor: "#f2e8c8"
        },
        theme: {
            day: {
                fontColor: "#000000",
                backgroundColor: "#be966e",
                contentBackgroundColor: "#f2e8c8"
            },
            dim: {
                fontColor: "#999999",
                contentBackgroundColor: "#111a2e",
                backgroundColor: "#111a2e"
            },
            night: {
                fontColor: "#999999",
                contentBackgroundColor: "#111111",
                backgroundColor: "#111111",
            }
        }
    }

    // 数据库实例
    static database = new Database(Aura.databaseProperties.name, Aura.databaseProperties.version, Aura.databaseProperties.stores);

}