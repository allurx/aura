/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BookListPosition } from "./book-list/book-list-ui";

/**
 * 当前标签页内往返阅读器时保留的书架位置，不写入外观或领域数据。
 */
export const bookshelfSession: {
    categoryId: string;
    search: string;
    position: BookListPosition | null;
    focusBookId: string;
} = { categoryId: "", search: "", position: null, focusBookId: "" };
