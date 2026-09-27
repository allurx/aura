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

import Database from "./database";
import DatabaseDefinition from "./database-definition";
import type { DatabaseMode } from "./database-mode";

/**
 * 事务管理器, 负责事务的创建和管理
 * @author allurx
 */
export default class TransactionManager {
    private static readonly DATABASE = new Database(
        DatabaseDefinition.name,
        DatabaseDefinition.schemaVersion,
        DatabaseDefinition.stores
    );

    /**
     * 在指定事务中执行操作，并等待事务实际提交后才返回结果。
     * operation 中不要等待文件读取、网络等非数据库异步工作，以免事务因没有待处理请求而提前结束。
     *
     * @template   T - operation返回值的类型
     * @param  storeNames - 需要操作的对象存储名称
     * @param  mode - 事务模式
     * @param  operation - 一个接收IDBTransaction参数并返回Promise的函数, 用于执行具体的数据库操作
     * @returns  解析为operation结果的Promise
     */
    public static async runTransaction<T>(
        storeNames: string | string[],
        mode: DatabaseMode,
        operation: (transaction: IDBTransaction) => Promise<T>
    ): Promise<T> {
        // 创建事务后立即监听结算，避免错过操作期间触发的完成或失败事件。
        const transaction = await this.createTransaction(storeNames, mode);
        const transactionPromise = this.transactionPromise(transaction);

        try {
            // 请求处理结束不等于事务提交，两个阶段都成功才向调用方返回。
            const result = await operation(transaction);
            await transactionPromise;
            return result;
        } catch (error) {
            // 尽力中止并等待清理，清理失败不能覆盖原始操作异常。
            await Promise.allSettled([
                // 发起中止
                Promise.try(() => {
                    transaction.abort();
                }),

                // 等待事务结果 Promise 结算。
                transactionPromise,
            ]);

            throw error;
        }
    }

    /**
     * 创建一个新的事务
     * @param  storeName - 需要操作的对象存储名称
     * @param  mode - 事务模式
     * @returns 解析为IDBTransaction的Promise
     */
    private static async createTransaction(storeName: string | string[], mode: DatabaseMode): Promise<IDBTransaction> {
        return (await TransactionManager.DATABASE.instance()).transaction(storeName, mode);
    }

    /**
     * 将IDBTransaction包装为Promise
     * @param  transaction - 需要包装的IDBTransaction
     * @returns 在事务完成时解析,在事务出错或中止时拒绝的Promise
     */
    private static transactionPromise(transaction: IDBTransaction): Promise<void> {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                resolve();
            };
            transaction.onerror = () => {
                reject(transaction.error ?? new Error("Transaction error"));
            };
            transaction.onabort = () => {
                reject(transaction.error ?? new Error("Transaction aborted"));
            };
        });
    }
}
