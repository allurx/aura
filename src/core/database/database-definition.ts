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
 * 数据库定义
 * @author allurx
 */
export default class DatabaseDefinition {
    // 数据库名称
    public static readonly name = "aura";

    // 数据库版本
    public static readonly version = 2;

    // 数据库对象存储定义
    public static readonly stores = {
        category: {
            name: "category",
            keyPath: "id",
            autoIncrement: false,
            indexes: {
                ukName: { name: "uk_name", path: "name", unique: true },
            },
        },
        file: {
            name: "file",
            keyPath: "id",
            autoIncrement: false,
            indexes: {
                ukHash: { name: "uk_hash", path: "hash", unique: true },
            },
            description: "文件",
        },
        book: {
            name: "book",
            keyPath: "id",
            autoIncrement: false,
            indexes: {
                idxFileId: { name: "idx_file_id", path: "fileId", unique: false },
                idxCategoryId: { name: "idx_category_id", path: "categoryId", unique: false },
            },
            description: "书籍",
        },
        toc: {
            name: "toc",
            keyPath: "id",
            autoIncrement: false,
            indexes: {
                ukFileId: { name: "uk_file_id", path: "fileId", unique: true },
            },
            description: "书籍目录",
        },
        chapter: {
            name: "chapter",
            keyPath: "id",
            autoIncrement: false,
            indexes: {
                idxFileId: { name: "idx_file_id", path: "fileId", unique: false },
                ukFileIdIndex: { name: "uk_file_id_index", path: ["fileId", "index"], unique: true },
            },
            description: "书籍章节",
        },
        readingProgress: {
            name: "reading_progress",
            keyPath: "id",
            autoIncrement: false,
            indexes: {
                ukBookId: { name: "uk_book_id", path: "bookId", unique: true },
            },
            description: "书籍阅读进度",
        },
        setting: {
            name: "setting",
            keyPath: "id",
            autoIncrement: false,
            indexes: {
                ukName: { name: "uk_name", path: "name", unique: true },
            },
            description: "设置",
        },
        theme: {
            name: "theme",
            keyPath: "id",
            autoIncrement: false,
            indexes: {
                ukName: { name: "uk_name", path: "name", unique: true },
            },
            description: "主题",
        },
    };
}

export const stores = DatabaseDefinition.stores;
export const categoryStore = DatabaseDefinition.stores.category;
export const fileStore = DatabaseDefinition.stores.file;
export const bookStore = DatabaseDefinition.stores.book;
export const tocStore = DatabaseDefinition.stores.toc;
export const chapterStore = DatabaseDefinition.stores.chapter;
export const readingProgressStore = DatabaseDefinition.stores.readingProgress;
export const settingStore = DatabaseDefinition.stores.setting;
export const themeStore = DatabaseDefinition.stores.theme;

export type StoreDefinition = (typeof DatabaseDefinition.stores)[keyof typeof DatabaseDefinition.stores];
