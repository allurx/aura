/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { openDatabase } from "./database";
import type { StoreName } from "./store";

/**
 * 请求和事务均成功后才返回；任一操作失败则中止整笔事务并保留原始异常。
 * operation 只等待数据库操作，文件读取和解析须在事务外完成。
 */
export async function runTransaction<T>(
    storeNames: StoreName | StoreName[],
    mode: "readonly" | "readwrite",
    operation: (transaction: IDBTransaction) => Promise<T>
): Promise<T> {
    const transaction = (await openDatabase()).transaction(storeNames, mode);
    const completed = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error("Transaction aborted"));
        };
    });

    try {
        const result = await operation(transaction);
        await completed;
        return result;
    } catch (error) {
        // 已结束的事务可能不能再 abort，清理失败不能覆盖操作异常。
        await Promise.allSettled([
            Promise.try(() => {
                transaction.abort();
            }),
            completed,
        ]);
        throw error;
    }
}
