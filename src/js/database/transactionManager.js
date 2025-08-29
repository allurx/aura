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

import DatabaseOperation from './databaseOperation.js';

/**
 * 事务管理器 - 负责事务的创建和管理
 * @author allurx
 */
export default class TransactionManager {

    #database;

    constructor(database) {
        this.#database = database;
    }

    /**
     * 执行数据库操作，支持 async/await
     * @param {string|string[]} storeNames - 目标 object store 名称
     * @param {"readonly"|"readwrite"} mode - 事务模式
     * @param {(DatabaseOperation) => any} databaseOperation - 数据库操作函数
     */
    async execute(storeNames, mode, databaseOperation) {

        const database = await this.#database.connect();
        const transaction = database.transaction(storeNames, mode);
        const transactionPromise = this.#transactionPromise(transaction);
        const stores = this.#stores(storeNames, transaction);
        const dpop = new DatabaseOperation(stores);

        try {
            // 等待用户操作完成
            return await databaseOperation(dpop);
        } finally {
            // 等待事务完成或失败
            await transactionPromise;
        }

    }

    // 获取stores
    #stores(storeNames, transaction) {
        const storeNameArray = Array.isArray(storeNames) ? storeNames : [storeNames];
        return storeNameArray.reduce((accumulator, storeName) => {
            accumulator[storeName] = transaction.objectStore(storeName);
            return accumulator;
        }, {});
    }

    /**
     * 将 IDBTransaction 包装为 Promise
     * @param {IDBTransaction} transaction 
     * @returns {Promise<void>}
     */
    #transactionPromise(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    }

}