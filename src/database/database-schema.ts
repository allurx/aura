/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Book from "@/domain/book/book";
import type Chapter from "@/domain/chapter/chapter";
import type BookFile from "@/domain/file/book-file";
import type Progress from "@/domain/progress/progress";
import type Toc from "@/domain/toc/toc";

/**
 * 仓库与持久化记录的对应关系；字段形状由各领域类型维护。
 */
export interface StoreRecords {
    file: BookFile;
    book: Book;
    toc: Toc;
    chapter: Chapter;
    progress: Progress;
}

/**
 * 索引字段的顺序和唯一约束；名称由所属 indexes 对象的键提供。
 */
export interface IndexDefinition<Field extends string = string> {
    readonly keyPath: Field | readonly Field[];
    readonly unique: boolean;
}

/**
 * 当前仓库的内联主键与索引；声明的字段必须存在于对应记录中。
 */
interface StoreDefinition<RecordType> {
    readonly keyPath: Extract<keyof RecordType, string> | readonly Extract<keyof RecordType, string>[];
    readonly indexes: Readonly<Record<string, IndexDefinition<Extract<keyof RecordType, string>>>>;
}

/**
 * 数据库结构的唯一声明入口，建库与存储访问的名称约束共用此定义。
 * 主键由业务记录提供；当前版本按项目约定只初始化新库。
 */
export const DATABASE_SCHEMA = {
    name: "aura",
    version: 1,
    stores: {
        file: {
            keyPath: "id",
            indexes: {
                byFormatAndHash: { keyPath: ["format", "hash"], unique: true },
            },
        },
        book: {
            keyPath: "id",
            indexes: {
                byFileId: { keyPath: "fileId", unique: false },
            },
        },
        toc: {
            keyPath: "fileId",
            indexes: {},
        },
        chapter: {
            keyPath: ["fileId", "chapterNumber"],
            indexes: {
                byFileId: { keyPath: "fileId", unique: false },
            },
        },
        progress: {
            keyPath: "bookId",
            indexes: {},
        },
    },
} as const satisfies {
    name: string;
    version: number;
    stores: { [Store in keyof StoreRecords]: StoreDefinition<StoreRecords[Store]> };
};

export type StoreName = keyof typeof DATABASE_SCHEMA.stores;
export type IndexName<Store extends StoreName> = keyof (typeof DATABASE_SCHEMA.stores)[Store]["indexes"] & string;
