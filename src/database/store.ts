/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Book from "@/domain/book/book";
import type Category from "@/domain/category/category";
import type Chapter from "@/domain/chapter/chapter";
import type BookFile from "@/domain/file/book-file";
import type Progress from "@/domain/progress/progress";
import type Toc from "@/domain/toc/toc";

/**
 * 当前数据库的记录类型；读取边界按本应用写入的结构收窄，不恢复类原型。
 */
interface StoreRecords {
    category: Category;
    file: BookFile;
    book: Book;
    toc: Toc;
    chapter: Chapter;
    progress: Progress;
}

export type StoreName = keyof StoreRecords;

/**
 * 将请求转为 Promise；请求成功不代表事务已经提交。
 */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error ?? new Error("IndexedDB request failed"));
        };
    });
}

/**
 * 读取主键对应的记录，不存在时返回 undefined。
 */
export async function getRecord<S extends StoreName>(transaction: IDBTransaction, store: S, key: IDBValidKey) {
    const record = await requestResult<unknown>(transaction.objectStore(store).get(key));
    return record as StoreRecords[S] | undefined;
}

/**
 * 读取索引对应的首条记录。
 */
export async function getRecordByIndex<S extends StoreName>(
    transaction: IDBTransaction,
    store: S,
    index: string,
    key: IDBValidKey
) {
    const record = await requestResult<unknown>(transaction.objectStore(store).index(index).get(key));
    return record as StoreRecords[S] | undefined;
}

/**
 * 读取存储中的全部记录；调用方不应借此加载全部章节正文。
 */
export async function getAllRecords<S extends StoreName>(transaction: IDBTransaction, store: S) {
    const records = await requestResult<unknown[]>(transaction.objectStore(store).getAll());
    return records as StoreRecords[S][];
}

/**
 * 新增记录，主键或唯一索引冲突时由事务回滚。
 */
export function addRecord<S extends StoreName>(transaction: IDBTransaction, store: S, record: StoreRecords[S]) {
    return requestResult(transaction.objectStore(store).add(record));
}

/**
 * 按主键写入记录，保存的是调用方提供的完整快照。
 */
export function putRecord<S extends StoreName>(transaction: IDBTransaction, store: S, record: StoreRecords[S]) {
    return requestResult(transaction.objectStore(store).put(record));
}

/**
 * 删除主键对应的记录。
 */
export function deleteRecord(transaction: IDBTransaction, store: StoreName, key: IDBValidKey) {
    return requestResult(transaction.objectStore(store).delete(key));
}

/**
 * 统计索引命中的记录，用于判断共享正文是否仍被引用。
 */
export function countRecordsByIndex(transaction: IDBTransaction, store: StoreName, index: string, key: IDBValidKey) {
    return requestResult(transaction.objectStore(store).index(index).count(key));
}

/**
 * 清空一个存储，跨存储原子性由调用方的事务保证。
 */
export function clearRecords(transaction: IDBTransaction, store: StoreName) {
    return requestResult(transaction.objectStore(store).clear());
}

/**
 * 入队删除索引命中的全部记录；实际提交和回滚由外层事务确认。
 */
export function deleteRecordsByIndex(
    transaction: IDBTransaction,
    store: StoreName,
    index: string,
    key: IDBValidKey
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const request = transaction.objectStore(store).index(index).openCursor(key);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve();
                return;
            }
            cursor.delete();
            cursor.continue();
        };
        request.onerror = () => {
            reject(request.error ?? new Error("Failed to delete records by index"));
        };
    });
}
