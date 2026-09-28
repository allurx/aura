/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 书架条目；相同正文可以对应不同书名、分类和阅读进度。
 */
export default interface Book {
    id: string;
    fileId: string;
    fileName: string;
    categoryId: string;
    // 导入时间，决定书架的默认顺序。
    createdTime: number;
}
