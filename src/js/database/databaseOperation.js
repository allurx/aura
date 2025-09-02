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
 * 数据库操作接口, 定义常用的数据库操作.
 * @author allurx
 */
export default class DatabaseOperation {

    /** @type {Array<IDBObjectStore>} */
    #stores;

    constructor(stores) {
        this.#stores = stores;
    }

    add(storeName, data) {
        const store = this.#store(storeName);
        const processedData = this.#deleteKeyForAutoIncrement(data, store);
        const requset = store.add(processedData.data);
        return this.#addOrUpdateRequestPromise(requset, store, processedData);
    }

    put(storeName, data) {
        const store = this.#store(storeName);
        const processedData = this.#deleteKeyForAutoIncrement(data, store);
        const requset = store.put(processedData.data);
        return this.#addOrUpdateRequestPromise(requset, store, processedData);
    }

    async putAll(storeName, dataArray) {
        return Promise.all(dataArray.map(data => this.put(storeName, data)));
    }

    getByKey(storeName, key) {
        return this.#requestPromise(this.#store(storeName).get(key));
    }

    getByIndex(storeName, indexName, indexValue) {
        return this.#requestPromise(
            this.#store(storeName).index(indexName).get(indexValue)
        );
    }

    getAll(storeName) {
        return this.#requestPromise(this.#store(storeName).getAll());
    }

    getAllByIndex(storeName, indexName, indexValue) {
        return this.#requestPromise(
            this.#store(storeName).index(indexName).getAll(indexValue)
        );
    }

    deleteByKey(storeName, key) {
        return this.#requestPromise(this.#store(storeName).delete(key));
    }

    deleteByIndex(storeName, indexName, indexValue) {
        return this.#requestPromise(
            this.#store(storeName).index(indexName).delete(indexValue)
        );
    }

    deleteAll(storeName) {
        return this.#requestPromise(this.#store(storeName).clear());
    }

    async deleteAllByIndex(storeName, indexName, indexValue) {

        const store = this.#store(storeName);
        const index = store.index(indexName);

        return new Promise((resolve, reject) => {
            const request = index.openCursor(IDBKeyRange.only(indexValue));
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

    count(storeName) {
        return this.#requestPromise(this.#store(storeName).count());
    }

    clear(storeName) {
        return this.#requestPromise(this.#store(storeName).clear());
    }

    /**
     * 获取指定store
     * @param {string} storeName - store名称
     */
    #store(storeName) {
        return this.#stores[storeName];
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
     * 添加或更新请求的Promise封装,将主键值设置到数据对象中
     * 
     * @param {IDBRequest} request - 要封装的请求
     * @param {IDBObjectStore} store - 对应的对象存储
     * @param {Object} processedData - 处理后的数据
     * @returns {Promise<any>}
     */
    #addOrUpdateRequestPromise(request, store, processedData) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                if (processedData.isKeyDeleted) {
                    processedData.data[store.keyPath] = request.result;
                }
                resolve(request.result);
            };
            request.onerror = () => {
                if (processedData.isKeyDeleted) {
                    processedData.data[store.keyPath] = processedData.oldValueOfKey;
                }
                reject(request.error);
            };
        });
    }

    /**
     * 删除autoIncrement主键字段,以确保IndexedDB能正确生成自增键.
     *
     * 当对象的主键字段存在但值为"undefined"或"null"时,
     * 直接插入到开启autoIncrement的对象存储会报DataError.
     * 本方法会删除该字段,使对象在插入时触发autoIncrement自动生成主键.
     *
     * @param {Object} data - 需要处理的数据
     * @param {IDBObjectStore} store - store对象
     * @returns {Object} - 处理后的对象
     */
    #deleteKeyForAutoIncrement(data, store) {
        const processedData = { isKeyDeleted: false, data: data };
        const keyPath = store.keyPath;
        const autoIncrement = store.autoIncrement;
        if (autoIncrement && keyPath in data && (data[keyPath] === undefined || data[keyPath] === null)) {
            processedData.oldValueOfKey = processedData.data[keyPath];
            processedData.isKeyDeleted = delete processedData.data[keyPath];
        }
        return processedData;
    }
}
