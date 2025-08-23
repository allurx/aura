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
                autoIncrement: true,
                indexes: {
                    bookGenreIndex: { name: "book_genre_index", path: "genre", unique: false }
                }
            },
            chapter: {
                name: "chapter",
                keyPath: ["bookId", "id"],
                autoIncrement: false,
                indexes: {
                    bookIdIndex: { name: "book_id_index", path: "bookId", unique: false },
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
            //pageWidth: Math.min(window.screen.width * 0.8, 800),
            pageWidth: Math.min(window.screen.width * 0.8, 800),
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

    /**
     * 给元素添加事件监听器
     * @param {Element} element - 要绑定事件的元素
     * @param {string} eventType - 事件类型，如 'click'
     * @param {Function} handler - 事件处理函数
     * @param {string} selector - 事件委托的目标选择器，没传则直接绑定element
     */
    static addEventListenerTo(element, eventType, handler, selector) {
        if (!selector) {
            // 普通事件绑定
            element.addEventListener(eventType, event => handler.call(element, event));
        } else {
            // 事件委托
            element.addEventListener(eventType, event => {
                const targetElement = event.target.closest(selector);
                if (targetElement && element.contains(targetElement)) {
                    handler.call(targetElement, event);
                }
            });
        }
    }

    static addEventListenerToAll(elements, eventType, handler, selector) {
        (elements ?? []).forEach(element => Aura.addEventListenerTo(element, eventType, handler, selector));
    }

}