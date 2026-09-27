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

import type { StoreDefinition } from "@/database/database-definition";
import type BaseModel from "./base-model";

/**
 * 在调用方提供的事务内读写模型，不自行创建或提交事务。
 * 请求 Promise 完成不代表事务已提交，事务结算由 TransactionManager 负责。
 * @template T - 模型类型
 * @author allurx
 */
export default abstract class BaseRepository<T extends BaseModel> {
    private readonly storeDefinition: StoreDefinition;
    private readonly modelConstructor: new (data: T) => T;

    protected constructor(storeDefinition: StoreDefinition, modelConstructor: new (data: T) => T) {
        this.storeDefinition = storeDefinition;
        this.modelConstructor = modelConstructor;
    }

    public async add(data: T, transaction: IDBTransaction) {
        return await this.requestPromise(transaction.objectStore(this.storeName()).add(data));
    }

    /**
     * 在同一事务内一次入队全部新增请求；原子性由调用方的事务保证。
     */
    public async addAll(dataArray: T[], transaction: IDBTransaction) {
        return await Promise.all(dataArray.map((data) => this.add(data, transaction)));
    }

    public async put(data: T, transaction: IDBTransaction) {
        return await this.requestPromise(transaction.objectStore(this.storeName()).put(data));
    }

    public async putAll(dataArray: T[], transaction: IDBTransaction) {
        return await Promise.all(dataArray.map((data) => this.put(data, transaction)));
    }

    /**
     * 按主键或键范围获取首条记录并恢复为模型实例，未找到时返回 null。
     */
    public async getByKey(key: IDBValidKey | IDBKeyRange, transaction: IDBTransaction) {
        const result = await this.requestPromise<unknown>(transaction.objectStore(this.storeName()).get(key));
        return result ? this.createModel(result as Required<T>) : null;
    }

    /**
     * 按索引获取首条匹配记录；非唯一索引的多条结果应使用 getAllByIndex。
     */
    public async getByIndex(indexName: string, indexValue: IDBValidKey | IDBKeyRange, transaction: IDBTransaction) {
        const result = await this.requestPromise<unknown>(
            transaction.objectStore(this.storeName()).index(indexName).get(indexValue)
        );
        return result ? this.createModel(result as Required<T>) : null;
    }

    /**
     * 遍历整个store,直到找到第一条满足指定字段值的记录为止(未建立索引时使用)
     * 适用于小数据量场景,大数据量请勿使用此方法
     * @param fieldName - 字段名称
     * @param fieldValue - 字段值
     * @param transaction - 事务
     */
    public async getByField<K extends keyof T>(
        fieldName: K,
        fieldValue: T[K],
        transaction: IDBTransaction
    ): Promise<T | null> {
        return new Promise<T | null>((resolve, reject) => {
            // 没有可用索引时逐条扫描，首次命中后立即结束。
            const request = transaction.objectStore(this.storeName()).openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    const record = cursor.value as Required<T>;
                    if (record[fieldName] === fieldValue) {
                        resolve(this.createModel(record));
                        return;
                    }
                    cursor.continue();
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                reject(request.error ?? new Error("Failed to get record by field"));
            };
        });
    }

    public async getAll(transaction: IDBTransaction) {
        return (await this.requestPromise<unknown[]>(transaction.objectStore(this.storeName()).getAll())).map((item) =>
            this.createModel(item as Required<T>)
        );
    }

    public async getAllByIndex(indexName: string, indexValue: IDBValidKey | IDBKeyRange, transaction: IDBTransaction) {
        return (
            await this.requestPromise(transaction.objectStore(this.storeName()).index(indexName).getAll(indexValue))
        ).map((item) => this.createModel(item as Required<T>));
    }

    public async deleteByKey(key: IDBValidKey | IDBKeyRange, transaction: IDBTransaction) {
        await this.requestPromise(transaction.objectStore(this.storeName()).delete(key));
    }

    /**
     * 删除索引命中的首条记录；需要删除全部匹配项时使用 deleteAllByIndex。
     */
    public async deleteByIndex(indexName: string, indexValue: IDBValidKey | IDBKeyRange, transaction: IDBTransaction) {
        const store = transaction.objectStore(this.storeName());
        const key = await this.requestPromise(store.index(indexName).getKey(indexValue));
        if (key) await this.requestPromise(store.delete(key));
    }

    public async deleteAllByIndex(
        indexName: string,
        indexValue: IDBValidKey | IDBKeyRange,
        transaction: IDBTransaction
    ) {
        await this.deleteAllByIndexRequestPromise(transaction.objectStore(this.storeName()), indexName, indexValue);
    }

    public async count(transaction: IDBTransaction, query?: IDBValidKey | IDBKeyRange) {
        return await this.requestPromise(transaction.objectStore(this.storeName()).count(query));
    }

    public async countByIndex(indexName: string, indexValue: IDBValidKey | IDBKeyRange, transaction: IDBTransaction) {
        return await this.requestPromise(transaction.objectStore(this.storeName()).index(indexName).count(indexValue));
    }

    public async clear(transaction: IDBTransaction) {
        await this.requestPromise(transaction.objectStore(this.storeName()).clear());
    }

    private storeName() {
        return this.storeDefinition.name;
    }

    private createModel(data: Required<T>): T {
        return new this.modelConstructor(data);
    }

    /**
     * 将单个 IDBRequest 转为 Promise；成功只表示请求结束，不表示整个事务提交。
     * @template R - 请求结果类型
     * @param  request - IndexedDB请求对象
     * @returns 请求结果
     */
    private requestPromise<R>(request: IDBRequest<R>): Promise<R> {
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
     * @returns 遍历并入队全部删除请求后完成；实际提交或回滚仍由外层事务确认。
     */
    private deleteAllByIndexRequestPromise(
        store: IDBObjectStore,
        indexName: string,
        indexValue: IDBValidKey | IDBKeyRange
    ): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const request = store.index(indexName).openCursor(indexValue);
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                    // 连续入队删除与游标请求，统一由外层事务负责错误和提交。
                    cursor.delete();
                    cursor.continue();
                } else {
                    // 游标耗尽，交由外层事务等待已入队的删除全部提交。
                    resolve();
                }
            };

            request.onerror = () => {
                reject(request.error ?? new Error("Failed to delete records by index"));
            };
        });
    }
}
