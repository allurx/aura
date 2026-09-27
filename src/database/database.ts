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

import type DatabaseDefinition from "./database-definition";

/**
 * 数据库
 * @author allurx
 */
export default class Database {
    private readonly name: string;
    private readonly schemaVersion: number;
    private readonly stores: typeof DatabaseDefinition.stores;
    private singleton!: IDBDatabase | null;

    public constructor(name: string, schemaVersion: number, stores: typeof DatabaseDefinition.stores) {
        this.name = name;
        this.schemaVersion = schemaVersion;
        this.stores = stores;
    }

    /**
     * 获取数据库实例
     * @returns 当前连接或新建立的数据库连接。
     */
    public async instance(): Promise<IDBDatabase> {
        return this.singleton ?? (await this.connect());
    }

    /**
     * 连接数据库
     * @returns 成功建立的数据库连接；打开失败或被其他标签页阻塞时拒绝。
     */
    private connect(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            // 打开指定版本，升级阶段只按定义创建缺失的存储及其索引。
            const request = indexedDB.open(this.name, this.schemaVersion);

            request.onupgradeneeded = () => {
                Object.values(this.stores).forEach((storeDefinition) => {
                    if (!request.result.objectStoreNames.contains(storeDefinition.name)) {
                        const store = request.result.createObjectStore(storeDefinition.name, {
                            keyPath: storeDefinition.keyPath,
                            autoIncrement: storeDefinition.autoIncrement,
                        });

                        // 索引归属于新建存储，与其在同一升级事务内创建。
                        Object.values(storeDefinition.indexes).forEach((index) => {
                            store.createIndex(index.name, index.path, { unique: index.unique });
                        });
                    }
                });
            };

            // 缓存成功建立的连接，供后续事务复用。
            request.onsuccess = () => {
                this.singleton = request.result;
                resolve(this.singleton);
            };

            // 将打开失败与跨标签页阻塞分别交给调用方处理。
            request.onerror = () => {
                reject(new Error(`Database connection failed`, { cause: request.error }));
            };

            request.onblocked = () => {
                reject(new Error("Database connection blocked. Please close other tabs."));
            };
        });
    }

    /**
     * 关闭数据库连接
     */
    public close() {
        this.singleton?.close();
    }
}
