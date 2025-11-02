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

import DatabaseDefinition from "./DatabaseDefinition.js";

/**
 * 数据库
 * @author allurx
 */
export default class Database {
    #name: string;
    #version: number;
    #stores: typeof DatabaseDefinition.stores;
    #instance!: IDBDatabase | null;

    constructor(name: string, version: number, stores: typeof DatabaseDefinition.stores) {
        this.#name = name;
        this.#version = version;
        this.#stores = stores;
    }

    /**
     * 获取数据库实例
     * @returns {Promise<IDBDatabase>} 返回一个解析为数据库实例的Promise.
     */
    async instance(): Promise<IDBDatabase> {
        return this.#instance ?? (await this.#connect());
    }

    /**
     * 连接数据库
     * @returns {Promise<IDBDatabase>} 返回一个解析为数据库实例的Promise.
     */
    #connect(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.#name, this.#version);
            request.onupgradeneeded = () => {
                const db = request.result;
                Object.values(this.#stores).forEach((storeProperty) => {
                    // 创建新的对象存储
                    if (!db.objectStoreNames.contains(storeProperty.name)) {
                        const store = db.createObjectStore(storeProperty.name, {
                            autoIncrement: storeProperty.autoIncrement,
                            keyPath: storeProperty.keyPath,
                        });
                        Object.values(storeProperty.indexes).forEach((index) => {
                            store.createIndex(index.name, index.path, { unique: index.unique });
                        });
                    }
                });
            };

            request.onsuccess = () => {
                this.#instance = request.result;
                resolve(this.#instance);
            };

            request.onerror = () => {
                reject(new Error(`Database connection failed`, { cause: request.error }));
            };

            request.onblocked = () => {
                reject(new Error("Database connection blocked. Please close other tabs."));
            };
        });
    }

    /**
     * 关闭数据库连接
     */
    close() {
        this.#instance?.close();
    }
}
