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

export default class Database {

    static READ_WRITE = "readwrite";
    static READ_ONLY = "readonly";
    static VERSION = 1;

    #name;
    #version;
    #properties;
    #instance = null;
    #transactionManager = new TransactionManager(this);

    // 用于处理并发打开请求的Promise
    #openPromise = null;

    constructor(name, version, properties) {
        this.#name = name;
        this.#version = version;
        this.#properties = properties;
    }

    /**
    * 打开数据库连接，这个方法会被其他方法自动调用，所以通常不需要手动调用它。
    * @returns {Promise<IDBDatabase>} 返回一个解析为数据库实例的 Promise。
    */
    connect() {

        // 如果已经有一个正在打开的请求，直接返回它，避免重复打开
        if (this.#openPromise) return this.#openPromise;

        // 创建一个新的 Promise 来处理数据库的打开过程
        this.#openPromise = new Promise((resolve, reject) => {

            // 如果数据库实例已存在，直接解析
            if (this.#instance) return resolve(this.#instance)

            const request = indexedDB.open(this.#name, this.#version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                Object.values(this.#properties)?.forEach(storeProperty => {
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
                reject(new Error('Database connection blocked. Please close other tabs.'));
            };
        });

        return this.#openPromise;
    }

    /**
    * 关闭数据库连接。
    */
    close = () => {
        if (this.#instance) {
            this.#instance.close();
            this.#instance = null;
            this.#openPromise = null;
        }
    };

    /**
     * 高级事务API - 在一个事务中执行多个操作
     * @param {string | string[]} storeNames - 存储名称
     * @param {string} mode - 事务模式
     * @param {DatabaseOperation} databaseOperation - 要执行的操作
     */
    async transaction(storeNames, mode, databaseOperation) {
        return this.#transactionManager.execute(storeNames, mode, databaseOperation);
    }

    // 便捷的单操作方法 - 自动包装在事务中
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
            databaseOperation.getAllByIndex(storeName, indexName, indexValue)
        );
    }

    async deleteByKey(storeName, key) {
        return this.transaction(storeName, Database.READ_WRITE, databaseOperation => databaseOperation.deleteByKey(storeName, key));
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

    // add = (storeName, data) => this.#withTransaction(storeName, Database.READ_WRITE, tx => this.#promisifyRequest(tx.objectStore(storeName).add(data)));
    // put = (storeName, data) => this.#withTransaction(storeName, Database.READ_WRITE, tx => this.#promisifyRequest(tx.objectStore(storeName).put(data)));

    // // 批量写入数据
    // putAll = (storeName, dataArray) => this.#withTransaction(storeName, Database.READ_WRITE, async (tx) => {
    //     const store = tx.objectStore(storeName);
    //     // 在同一个事务中并发执行所有 put 操作
    //     await Promise.all(dataArray.map(data => this.#promisifyRequest(store.put(data))));
    // });

    // getByKey = (storeName, key) => this.#withTransaction(storeName, Database.READ_ONLY, tx => this.#promisifyRequest(tx.objectStore(storeName).get(key)));
    // getByIndex = (storeName, indexName, indexValue) => this.#withTransaction(storeName, Database.READ_ONLY, tx => this.#promisifyRequest(tx.objectStore(storeName).index(indexName).get(indexValue)));

    // getAll = (storeName) => this.#withTransaction(storeName, Database.READ_ONLY, tx => this.#promisifyRequest(tx.objectStore(storeName).getAll()));
    // getAllByIndex = (storeName, indexName, indexValue) => this.#withTransaction(storeName, Database.READ_ONLY, tx => this.#promisifyRequest(tx.objectStore(storeName).index(indexName).getAll(indexValue)));

    // deleteByKey = (storeName, key) => this.#withTransaction(storeName, Database.READ_WRITE, tx => this.#promisifyRequest(tx.objectStore(storeName).delete(key)));

    // /**
    //  * 根据索引值删除所有匹配的记录。
    //  * 使用游标（cursor）以提高性能和内存效率，特别适合处理大量数据。
    //  */
    // deleteAllByIndex = (storeName, indexName, indexValue) => this.#withTransaction(storeName, Database.READ_WRITE, async (tx) => {
    //     const store = tx.objectStore(storeName);
    //     const index = store.index(indexName);
    //     let cursor = await this.#promisifyRequest(index.openCursor(IDBKeyRange.only(indexValue)));

    //     while (cursor) {
    //         cursor.delete(); // 删除当前游标指向的记录
    //         cursor = await this.#promisifyRequest(cursor.continue());
    //     }
    // });

    // count = (storeName) => this.#withTransaction(storeName, Database.READ_ONLY, tx => this.#promisifyRequest(tx.objectStore(storeName).count()));

    // /**
    //  * 清空一个对象存储中的所有数据。
    //  */
    // clear = (storeName) => this.#withTransaction(storeName, Database.READ_WRITE, tx => this.#promisifyRequest(tx.objectStore(storeName).clear()));


    // /**
    //  * 一个私有的核心辅助函数，用于管理事务。
    //  * 它能确保在执行操作前数据库已成功打开，并将整个操作封装在Promise中。
    //  * @param {string | string[]} storeNames - 一个或多个对象存储的名称。
    //  * @param {IDBTransactionMode} mode - 事务模式 (readonly或readwrite)。
    //  * @param {(transaction: IDBTransaction) => Promise<any>} action - 要在事务中执行的异步操作。
    //  * @returns {Promise<any>} 返回一个 Promise，它会解析为 action 的执行结果。
    //  */
    // async #withTransaction(storeNames, mode, action) {

    //     // 等待连接成功，确保对数据库的任何操作都是在连接建立后进行。
    //     const db = await this.#connect();

    //     return new Promise((resolve, reject) => {

    //         const transaction = db.transaction(storeNames, mode);

    //         // 将整个action的结果通过transaction的oncomplete和onerror来最终确定
    //         let actionResult;

    //         transaction.oncomplete = (event) => resolve(actionResult);
    //         transaction.onerror = (event) => reject(event.target.error);
    //         transaction.onabort = (event) => reject(event.target.error);

    //         // 执行传入的异步操作
    //         action(transaction)
    //             .then(result => {
    //                 // 保存操作结果
    //                 actionResult = result;
    //             })
    //             .catch(error => {
    //                 // 如果action内部出错，中止并回滚事务
    //                 transaction.abort();
    //                 reject(error);
    //             });
    //     });
    // }

    // /**
    //  * 将一个 IDBRequest 请求转换为 Promise。
    //  * @param {IDBRequest} request - 要转换的请求。
    //  * @returns {Promise<any>}
    //  */
    // #promisifyRequest(request) {
    //     return new Promise((resolve, reject) => {
    //         request.onsuccess = () => resolve(request.result);
    //         request.onerror = () => reject(request.error);
    //     });
    // }

}