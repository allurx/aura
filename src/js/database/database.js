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

import TransactionManager from "./transactionManager.js";

/**
 * 数据库
 * @author allurx
 */
export default class Database {

    static READ_WRITE = "readwrite";
    static READ_ONLY = "readonly";

    /** @type {string} */
    #name;

    /** @type {number} */
    #version;

    /** @type {Object} */
    #properties;

    /** @type {IDBDatabase} */
    #instance = null;

    /** @type {TransactionManager} */
    #transactionManager = new TransactionManager(this);

    /** @type {Promise<IDBDatabase>} 用于处理并发打开请求的Promise */
    #openPromise = null;

    constructor(name, version, properties) {
        this.#name = name;
        this.#version = version;
        this.#properties = properties;
    }

    /**
    * 打开数据库连接,这个方法会被其他方法自动调用,所以通常不需要手动调用它.
    * @returns {Promise<IDBDatabase>} 返回一个解析为数据库实例的Promise. 
    */
    connect() {

        // 如果已经有一个正在打开的请求,直接返回它避免重复打开
        if (this.#openPromise) return this.#openPromise;

        // 创建一个新的Promise来处理数据库的打开过程
        this.#openPromise = new Promise((resolve, reject) => {

            // 如果数据库实例已存在,直接解析
            if (this.#instance) return resolve(this.#instance)

            const request = indexedDB.open(this.#name, this.#version);

            request.onupgradeneeded = (event) => {

                const db = event.target.result;

                // 开发阶段方便调试,删除旧的对象存储
                Array.from(db.objectStoreNames).forEach(storeName => {
                    db.deleteObjectStore(storeName);
                });

                Object.values(this.#properties)?.forEach(storeProperty => {

                    // 创建新的对象存储
                    if (!db.objectStoreNames.contains(storeProperty.name)) {
                        const store = db.createObjectStore(storeProperty.name, {
                            keyPath: storeProperty.keyPath,
                            autoIncrement: storeProperty.autoIncrement,
                        });
                        Object.values(storeProperty.indexes)?.forEach(index => {
                            store.createIndex(index.name, index.path, { unique: index.unique });
                        });
                    }
                });
            };

            request.onsuccess = (event) => {
                this.#instance = event.target.result;
                resolve(this.#instance);
            };

            request.onerror = (event) => {
                this.#openPromise = null;
                reject(new Error(`Database connection failed: ${event.target.error}`));
            };

            request.onblocked = () => {
                this.#openPromise = null;
                reject(new Error("Database connection blocked. Please close other tabs."));
            };
        });

        return this.#openPromise;
    }

    /**
    * 关闭数据库连接
    */
    close() {
        if (this.#instance) {
            this.#instance.close();
            this.#instance = null;
            this.#openPromise = null;
        }
    };

    /**
     * 高级事务api,在一个事务中执行多个操作
     * 注意: 事务内部不要await普通异步操作(文件解析、网络请求、计算等),会让js线程空闲,导致事务提前结束.

     * @param {string | string[]} storeNames - 存储名称
     * @param {string} mode - 事务模式
     * @param {DatabaseOperation} databaseOperation - 要执行的操作
     */
    async transaction(storeNames, mode, databaseOperation) {
        return this.#transactionManager.execute(storeNames, mode, databaseOperation);
    }

    async add(storeName, data) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation => databaseOperation.add(storeName, data));
    }

    async put(storeName, data) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation => databaseOperation.put(storeName, data));
    }

    async putAll(storeName, dataArray) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation => databaseOperation.putAll(storeName, dataArray));
    }

    async getByKey(storeName, key) {
        return this.transaction(storeName, Database.READ_ONLY, databaseOperation => databaseOperation.getByKey(storeName, key));
    }

    async getByIndex(storeName, indexName, indexValue) {
        return this.transaction(storeName, Database.READ_ONLY, databaseOperation =>
            databaseOperation.getByIndex(storeName, indexName, indexValue)
        );
    }

    async getAll(storeName) {
        return this.transaction(storeName, Database.READ_ONLY, databaseOperation => databaseOperation.getAll(storeName));
    }

    async getAllByIndex(storeName, indexName, indexValue) {
        return this.transaction(storeName, Database.READ_ONLY, databaseOperation =>
            databaseOperation.getAllByIndex(storeName, indexName, indexValue));
    }

    async deleteByKey(storeName, key) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation => databaseOperation.deleteByKey(storeName, key));
    }

    async deleteByIndex(storeName, indexName, indexValue) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation =>
            databaseOperation.deleteByIndex(storeName, indexName, indexValue)
        );
    }

    async deleteAll(storeName) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation =>
            databaseOperation.deleteAll(storeName)
        );
    }

    async deleteAllByIndex(storeName, indexName, indexValue) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation =>
            databaseOperation.deleteAllByIndex(storeName, indexName, indexValue)
        );
    }

    async count(storeName) {
        return this.transaction(storeName, Database.READ_ONLY, databaseOperation => databaseOperation.count(storeName));
    }

    async clear(storeName) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation => databaseOperation.clear(storeName));
    }

}