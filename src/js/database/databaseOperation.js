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
 * 数据库操作接口 - 定义常用的数据库操作
 * @author allurx
 */
export default class DatabaseOperation {

    #transaction;

    constructor(transaction) {
        this.#transaction = transaction;
    }

    add(storeName, data) {
        return this.#promisifyRequest(this.#transaction.objectStore(storeName).add(data));
    }

    put(storeName, data) {
        return this.#promisifyRequest(this.#transaction.objectStore(storeName).put(data));
    }

    async putAll(storeName, dataArray) {
        const store = this.#transaction.objectStore(storeName);
        return Promise.all(dataArray.map(data => this.#promisifyRequest(store.put(data))));
    }

    getByKey(storeName, key) {
        return this.#promisifyRequest(this.#transaction.objectStore(storeName).get(key));
    }

    getByIndex(storeName, indexName, indexValue) {
        return this.#promisifyRequest(
            this.#transaction.objectStore(storeName).index(indexName).get(indexValue)
        );
    }

    getAll(storeName) {
        return this.#promisifyRequest(this.#transaction.objectStore(storeName).getAll());
    }

    getAllByIndex(storeName, indexName, indexValue) {
        return this.#promisifyRequest(
            this.#transaction.objectStore(storeName).index(indexName).getAll(indexValue)
        );
    }

    deleteByKey(storeName, key) {
        return this.#promisifyRequest(this.#transaction.objectStore(storeName).delete(key));
    }

    async deleteAllByIndex(storeName, indexName, indexValue) {

        const store = this.#transaction.objectStore(storeName);
        const index = store.index(indexName);

        return new Promise((resolve, reject) => {
            const request = index.openCursor(IDBKeyRange.only(indexValue));
            request.onsuccess = async (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    await this.#promisifyRequest(cursor.delete());
                    cursor.continue();
                } else {
                    // 没有更多记录，完成删除
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    count(storeName) {
        return this.#promisifyRequest(this.#transaction.objectStore(storeName).count());
    }

    clear(storeName) {
        return this.#promisifyRequest(this.#transaction.objectStore(storeName).clear());
    }

    /**
     * 将一个 IDBRequest 请求转换为 Promise。
     * @param {IDBRequest} request - 要转换的请求。
     * @returns {Promise<any>}
     */
    #promisifyRequest(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}
