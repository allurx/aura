/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

let connectionPromise: Promise<IDBDatabase> | undefined;

/**
 * 复用当前数据库连接；只初始化当前结构，不迁移旧数据。
 */
export function openDatabase(): Promise<IDBDatabase> {
    connectionPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("aura", 1);
        let blocked = false;

        request.onupgradeneeded = () => {
            const database = request.result;
            database.createObjectStore("file", { keyPath: "id" }).createIndex("hash", "hash", { unique: true });
            database.createObjectStore("book", { keyPath: "id" }).createIndex("fileId", "fileId");
            database.createObjectStore("toc", { keyPath: "fileId" });
            database
                .createObjectStore("chapter", { keyPath: ["fileId", "chapterNumber"] })
                .createIndex("fileId", "fileId");
            database.createObjectStore("progress", { keyPath: "bookId" });
        };

        request.onsuccess = () => {
            const database = request.result;
            // blocked 已向调用方报错；稍后打开的连接不能成为无人持有的连接。
            if (blocked) {
                database.close();
                return;
            }

            // 其他标签页要求升级时释放连接，后续操作重新打开。
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
