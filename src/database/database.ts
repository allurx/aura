/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { DATABASE_SCHEMA, type IndexDefinition } from "./database-schema";

let connectionPromise: Promise<IDBDatabase> | undefined;

/**
 * 复用当前数据库连接；只初始化当前结构，不迁移旧数据。
 */
export function openDatabase(): Promise<IDBDatabase> {
    connectionPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DATABASE_SCHEMA.name, DATABASE_SCHEMA.version);
        let blocked = false;

        request.onupgradeneeded = () => {
            const database = request.result;
            for (const [name, definition] of Object.entries(DATABASE_SCHEMA.stores)) {
                const store = database.createObjectStore(name, {
                    keyPath: typeof definition.keyPath === "string" ? definition.keyPath : [...definition.keyPath],
                });
                const indexes: Readonly<Record<string, IndexDefinition>> = definition.indexes;
                for (const [indexName, index] of Object.entries(indexes)) {
                    const keyPath = typeof index.keyPath === "string" ? index.keyPath : [...index.keyPath];
                    store.createIndex(indexName, keyPath, { unique: index.unique });
                }
            }
        };

        request.onsuccess = () => {
            const database = request.result;
            // blocked 已向调用方报错；稍后打开的连接不能成为无人持有的连接。
            if (blocked) {
                database.close();
                return;
            }

            // 数据库被升级或删除时释放连接，后续操作重新打开。
            database.onversionchange = () => {
                database.close();
                connectionPromise = undefined;
            };
            database.onclose = () => {
                connectionPromise = undefined;
            };
            resolve(database);
        };
        request.onerror = () => {
            reject(new Error("Database connection failed", { cause: request.error }));
        };
        request.onblocked = () => {
            blocked = true;
            reject(new Error("Database connection blocked. Please close other tabs."));
        };
    }).catch((error: unknown) => {
        connectionPromise = undefined;
        throw error;
    });

    return connectionPromise;
}

/**
 * 删除整个数据库，不依赖旧结构能否打开；现有连接通过 versionchange 释放。
 * 阻塞时通知调用方并继续等待，只有 success 才代表删除完成。
 */
export function deleteDatabase(onBlocked: () => void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DATABASE_SCHEMA.name);
        request.onblocked = onBlocked;
        request.onsuccess = () => {
            resolve();
        };
        request.onerror = () => {
            reject(new Error("Database deletion failed", { cause: request.error }));
        };
    });
}
