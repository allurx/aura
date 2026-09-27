/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type Category from "@/domain/category/category";
import ObjectUtil from "@/utils/object-util";
import type Metadata from "@/domain/metadata/metadata";

/**
 * 当前标签页内往返阅读器时保留的书架位置，不写入外观或领域数据。
 */
export const bookshelfSession = { categoryId: "", search: "", scrollTop: 0, focusBookId: "" };

/**
 * 书架当前分类与初始化数据；空分类表示虚拟的全部书籍。
 * @author allurx
 */
export default class BookshelfState {
    public readonly metadata!: Metadata;
    public readonly categories!: Category[];
    public categoryId!: string;

    /**
     * 从初始化结果构造页面状态。
     */
    public constructor(data: Required<BookshelfState>) {
        ObjectUtil.assignOwnProperties<BookshelfState>(this, data);
    }
}
