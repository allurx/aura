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

import DatabaseDefinition from "../core/database/DatabaseDefinition.js";

/**
 * Base Data Access Object (DAO) class providing common database operations.
 * @author allurx
 */
export default class BaseDao {

    /** @see {DatabaseDefinition.stores} */
    #storeDefinition;
    #modelClass;

    constructor(storeDefinition, modelClass) {
        this.#storeDefinition = storeDefinition;
        this.#modelClass = modelClass;
    }

    get storeName() {
        return this.#storeDefinition.name;
    }

    async add(data, transaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.add(data));
    }

    async put(data, transaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.put(data));
    }

    async putAll(dataArray, transaction) {
        return await Promise.all(dataArray.map(data => this.put(data, transaction)));
    }

    async getByKey(key, transaction) {
        const store = transaction.objectStore(this.storeName);
        return this.#createModel(await this.#requestPromise(store.get(key)));
    }

    async getByIndex(indexName, indexValue, transaction) {
        const store = transaction.objectStore(this.storeName);
        return this.#createModel(await this.#requestPromise(store.index(indexName).get(indexValue)));
    }

    async getAll(transaction) {
        const store = transaction.objectStore(this.storeName);
        const result = await this.#requestPromise(store.getAll());
        return result.map(item => this.#createModel(item));
    }

    async getAllByIndex(indexName, indexValue, transaction) {
        const store = transaction.objectStore(this.storeName);
        const result = await this.#requestPromise(store.index(indexName).getAll(indexValue));
        return result.map(item => this.#createModel(item));
    }

    async deleteByKey(key, transaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.delete(key));
    }

    async deleteByIndex(indexName, indexValue, transaction) {
        const store = transaction.objectStore(this.storeName);
        const key = await this.#requestPromise(store.index(indexName).getKey(indexValue));
        return await this.#requestPromise(store.delete(key));
    }

    async deleteAllByIndex(indexName, indexValue, transaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#deleteAllByIndexRequestPromise(store, indexName, indexValue);
    }

    async count(transaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.count());
    }

    async countByIndex(indexName, indexValue, transaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.index(indexName).count(indexValue));
    }

    async clear(transaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.clear());
    }

    #createModel(data) {
        return (

            // 有数据且指定了模型类
            data &&

            // 必须是函数(class 实际是构造函数)
            typeof this.#modelClass === "function" &&

            // 排除原生 Object        
            this.#modelClass !== Object &&

            // 必须有原型                 
            this.#modelClass.prototype &&

            // 确保是可构造的类
            this.#modelClass.prototype.constructor === this.#modelClass

        ) ? new this.#modelClass(data) : data;
    }

    /**
     * 将IDBRequest转换为Promise
     * @param {IDBRequest} request - 要转换的请求
     * @returns {Promise<any>}
     */
    #requestPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 根据索引删除所有匹配的记录
     * @param {IDBObjectStore} store - 对应的对象存储   
     * @param {string} indexName - 索引名称
     * @param {any} indexValue - 索引值
     * @returns {Promise<any>}
     */
    #deleteAllByIndexRequestPromise(store, indexName, indexValue) {
        return new Promise((resolve, reject) => {
            const request = store.index(indexName).openCursor(IDBKeyRange.only(indexValue));
            request.onsuccess = async (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    await this.#requestPromise(cursor.delete());
                    cursor.continue();
                } else {
                    // 没有更多记录,完成删除
                    resolve();
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

}