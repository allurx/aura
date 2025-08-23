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
 */
export default class TransactionManager {

    #database;

    constructor(database) {
        this.#database = database;
    }

    async execute(storeNames, mode, operation) {

        const db = await this.#database.connect();

        return new Promise((resolve, reject) => {

            let result;
            const transaction = db.transaction(storeNames, mode);

            transaction.oncomplete = (event) => resolve(result);
            transaction.onerror = (event) => reject(event.target.error);
            transaction.onabort = (event) => reject(event.target.error);

            // 创建数据库操作
            const databaseOperations = new DatabaseOperation(transaction);

            Promise.resolve(operation(databaseOperations))
                .then(res => { 
                    result = res; 
                })
                .catch(error => {
                    transaction.abort();
                    reject(error);
                });
        });
    }

}