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

import Database from "./database.js";
import DatabaseDefinition from "./DatabaseDefinition.js";

/**
 * 事务管理器, 负责事务的创建和管理
 * @author allurx
 */
export default class TransactionManager {

    static #DATABASE = new Database(DatabaseDefinition.name, DatabaseDefinition.version, DatabaseDefinition.stores);
    static READ_ONLY = "readonly";
    static READ_WRITE = "readwrite";
    static VERSION_CHANGE = "versionchange";

    /**
     * 执行一个带有事务的操作
     * 注意: 不要在operation中执行除了数据库操作以外的异步操作, 否则可能导致事务被浏览器提前结束
     * @param {string|string[]} storeNames - store名称或名称数组
     * @param {"readonly"|"readwrite"} mode - 事务模式
     * @param {(transaction: IDBTransaction) => Promise<any>} operation - 事务操作
     * @returns {Promise<any>} - 事务结果
     */
    static async runTransaction(storeNames, mode, operation) {
        const transaction = await this.#createTransaction(storeNames, mode);
        const transactionPromise = this.#transactionPromise(transaction);
        try {
            // 等待用户操作完成
            return await operation(transaction);
        } catch (error) {
            transaction.dbopError = new Error("DatabaseOperation failed");
            transaction.abort();
            throw error;
        } finally {
            // 等待事务完成或失败
            // 注意捕获异常否则会导致try/catch中的error被覆盖
            await transactionPromise.catch(error => {
                console.error("Transaction failed:", error);
            });
        }
    }

    /**
     * 创建一个新的事务
     * @param {string} storeName - store名称
     * @param {"readonly"|"readwrite"} mode - 事务模式
     * @returns {Promise<IDBTransaction>} - 返回一个解析为IDBTransaction的Promise
     */
    static async #createTransaction(storeName, mode) {
        const database = await TransactionManager.#DATABASE.instance();
        return database.transaction(storeName, mode);
    }

    /**
     * 将IDBTransaction包装为Promise
     * @param {IDBTransaction} transaction 
     * @returns {Promise<void>} 包装为Promise的IDBTransaction
     */
    static #transactionPromise(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("Transaction error"));
            transaction.onabort = () => reject(transaction.dbopError ?? transaction.error ?? new Error("Transaction aborted"));
        });
    }

}