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

import type BaseModel from "./base-model";
import type BaseRepository from "./base-repository";

/**
 * 复用仓库的数据操作入口；事务由调用方传入，不在服务内单独提交。
 * 需要跨多个服务保证原子性时，应将同一事务传给相关调用。
 * @author allurx
 */
export default class BaseService<T extends BaseModel> {
    protected readonly repository: BaseRepository<T>;

    public constructor(repository: BaseRepository<T>) {
        this.repository = repository;
    }

    public async add(model: T, transaction: IDBTransaction): Promise<void> {
        await this.repository.add(model, transaction);
    }

    public async addAll(models: T[], transaction: IDBTransaction): Promise<void> {
        await this.repository.addAll(models, transaction);
    }

    public async update(model: T, transaction: IDBTransaction): Promise<void> {
        await this.repository.put(model, transaction);
    }

    public async getByKey(key: IDBValidKey | IDBKeyRange, transaction: IDBTransaction): Promise<T | null> {
        return await this.repository.getByKey(key, transaction);
    }

    public async getByIndex(
        indexName: string,
        indexKey: IDBValidKey | IDBKeyRange,
        transaction: IDBTransaction
    ): Promise<T | null> {
        return await this.repository.getByIndex(indexName, indexKey, transaction);
    }

    public async getByField<K extends keyof T>(
        fieldName: K,
        fieldValue: T[K],
        transaction: IDBTransaction
    ): Promise<T | null> {
        return await this.repository.getByField(fieldName, fieldValue, transaction);
    }

    public async getAll(transaction: IDBTransaction): Promise<T[]> {
        return await this.repository.getAll(transaction);
    }

    public async getAllByIndex(
        indexName: string,
        indexKey: IDBValidKey | IDBKeyRange,
        transaction: IDBTransaction
    ): Promise<T[]> {
        return await this.repository.getAllByIndex(indexName, indexKey, transaction);
    }

    public async deleteByKey(key: IDBValidKey | IDBKeyRange, transaction: IDBTransaction): Promise<void> {
        await this.repository.deleteByKey(key, transaction);
    }

    public async deleteByIndex(
        indexName: string,
        indexKey: IDBValidKey | IDBKeyRange,
        transaction: IDBTransaction
    ): Promise<void> {
        await this.repository.deleteByIndex(indexName, indexKey, transaction);
    }

    public async deleteAllByIndex(
        indexName: string,
        indexKey: IDBValidKey | IDBKeyRange,
        transaction: IDBTransaction
    ): Promise<void> {
        await this.repository.deleteAllByIndex(indexName, indexKey, transaction);
    }

    public async clear(transaction: IDBTransaction): Promise<void> {
        await this.repository.clear(transaction);
    }

    public async count(transaction: IDBTransaction, query?: IDBValidKey | IDBKeyRange): Promise<number> {
        return await this.repository.count(transaction, query);
    }

    public async countByIndex(
        indexName: string,
        indexKey: IDBValidKey | IDBKeyRange,
        transaction: IDBTransaction
    ): Promise<number> {
        return await this.repository.countByIndex(indexName, indexKey, transaction);
    }
}
