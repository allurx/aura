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

import { StoreDefinition } from "../core/database/DatabaseDefinition.js";

/**
 * 基础数据访问对象类,提供通用数据库操作
 * @template T - 模型类型
 * @author allurx
 */
export default class BaseDao<T> {
    #storeDefinition: StoreDefinition;
    #modelConstructor: new (data: Partial<T>) => T;

    constructor(storeDefinition: StoreDefinition, modelConstructor: new (data: Partial<T>) => T) {
        this.#storeDefinition = storeDefinition;
        this.#modelConstructor = modelConstructor;
    }

    get storeName() {
        return this.#storeDefinition.name;
    }

    async add(data: T, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.add(data));
    }

    async put(data: T, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.put(data));
    }

    async putAll(dataArray: T[], transaction: IDBTransaction) {
        return await Promise.all(dataArray.map((data) => this.put(data, transaction)));
    }

    async getByKey(key: IDBValidKey, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        const result = await this.#requestPromise<unknown>(store.get(key));
        return result ? this.#createModel(result as Required<T>) : null;
    }

    async getByIndex(indexName: string, indexValue: IDBValidKey, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        const result = await this.#requestPromise<unknown>(store.index(indexName).get(indexValue));
        return result ? this.#createModel(result as Required<T>) : null;
    }

    async getAll(transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        const result = await this.#requestPromise<unknown[]>(store.getAll());
        return result.map((item) => this.#createModel(item as Required<T>));
    }

    async getAllByIndex(indexName: string, indexValue: IDBValidKey, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        const result = await this.#requestPromise(store.index(indexName).getAll(indexValue));
        return result.map((item) => this.#createModel(item as Required<T>));
    }

    async deleteByKey(key: IDBValidKey, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        await this.#requestPromise(store.delete(key));
    }

    async deleteByIndex(indexName: string, indexValue: IDBValidKey, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        const key = await this.#requestPromise(store.index(indexName).getKey(indexValue));
        if (key) await this.#requestPromise(store.delete(key));
    }

    async deleteAllByIndex(indexName: string, indexValue: IDBValidKey, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        await this.#deleteAllByIndexRequestPromise(store, indexName, indexValue);
    }

    async count(transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.count());
    }

    async countByIndex(indexName: string, indexValue: IDBValidKey, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        return await this.#requestPromise(store.index(indexName).count(indexValue));
    }

    async clear(transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName);
        await this.#requestPromise(store.clear());
    }

    #createModel(data: Required<T>): T {
        return new this.#modelConstructor(data);
    }

    /**
     * 将IDBRequest转换为Promise
     * @template R - 请求结果类型
     * @param  request - IndexedDB请求对象
     * @returns 请求结果
     */
    #requestPromise<R>(request: IDBRequest<R>): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Failed to get IndexedDB request result"));
            };
        });
    }

    /**
     * 根据索引删除所有匹配的记录
     * @param store - 对象存储
     * @param indexName - 索引名称
     * @param indexValue - 索引值
     * @returns 删除完成的Promise
     */
    #deleteAllByIndexRequestPromise(store: IDBObjectStore, indexName: string, indexValue: IDBValidKey) {
        return new Promise<void>((resolve, reject) => {
            const request = store.index(indexName).openCursor(IDBKeyRange.only(indexValue));
            request.onsuccess = async () => {
                const cursor = request.result;
                if (cursor) {
                    await this.#requestPromise(cursor.delete());
                    cursor.continue();
                } else {
                    // 没有更多记录,完成删除
                    resolve();
                }
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Failed to delete records by index"));
            };
        });
    }
}
