/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { DATABASE_SCHEMA, type IndexDefinition } from "./database-schema";
import OperationError from "@/errors/operation-error";

let connectionPromise: Promise<IDBDatabase> | undefined;

/**
 * 标识已确认的格式不兼容，供页面提供恢复入口；不将普通读取故障归为需要重置。
 */
export class DatabaseFormatError extends OperationError {
    public constructor(
        public readonly newer: boolean,
        cause?: unknown
    ) {
        super(
            newer ? "书库版本高于当前支持范围" : "本地书库格式不兼容",
            newer
                ? "这份书库的数据库版本高于当前程序支持的版本，原数据仍保留。"
                : "当前版本无法读取这份书库，原数据仍保留。",
            cause,
            newer
                ? "请使用原来能读取这份书库的 Aura 版本。确认原文件已保存前，不要重置。"
                : [
                      "先保留原始书籍文件；没有原文件时，请在原来可读取书库的版本和浏览器中导出。",
                      "确认文件已保存后，再重置并重新导入。原分类归属、阅读进度和外观设置不会恢复。",
                  ]
        );
        this.name = "DatabaseFormatError";
    }
}

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

            // 缺少必需 store 时无法执行当前操作；无关的额外 store 不影响访问，也不清理。
            const stores = Object.keys(DATABASE_SCHEMA.stores);
            if (stores.some((name) => !database.objectStoreNames.contains(name))) {
                database.close();
                reject(new DatabaseFormatError(false));
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
            reject(
                request.error?.name === "VersionError"
                    ? new DatabaseFormatError(true, request.error)
                    : new Error("Database connection failed", { cause: request.error })
            );
        };
        request.onblocked = () => {
            blocked = true;
            reject(
                new OperationError(
                    "书库正被其他页面占用",
                    "其他 Aura 页面正在使用书库，原数据未改动。",
                    new Error("Database connection blocked"),
                    "请关闭其他 Aura 标签页或窗口，再点击“重新读取”。"
                )
            );
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
