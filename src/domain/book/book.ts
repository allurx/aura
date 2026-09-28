/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CategoryId } from "@/domain/category/category";

/**
 * 书架条目；相同正文可以对应不同书名、分类和阅读进度。
 */
export default interface Book {
    id: string;
    fileId: string;
    fileName: string;
    categoryId: CategoryId;
    // 导入时间，决定书架的默认顺序。
    createdTime: number;
}
