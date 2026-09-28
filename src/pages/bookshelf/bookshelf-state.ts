/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Category from "@/domain/category/category";

/**
 * 当前标签页内往返阅读器时保留的书架位置，不写入外观或领域数据。
 */
export const bookshelfSession = { categoryId: "", search: "", scrollTop: 0, focusBookId: "" };

/**
 * 书架当前分类与初始化数据；空分类表示虚拟的全部书籍。
 */
export default interface BookshelfState {
    categories: Category[];
    categoryId: string;
}
