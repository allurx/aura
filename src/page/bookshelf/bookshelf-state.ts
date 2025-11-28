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

import Category from "../../domain/category/category";
import ObjectUtil from "../../util/object-util";
import Metadata from "../../domain/metadata/metadata";

/**
 * 书架状态
 * @author allurx
 */
export default class BookshelfState {
    public readonly metadata!: Metadata;
    public readonly categories!: Category[];
    // 当前选中的书籍分类id
    public categoryId!: string;

    public constructor(data: Required<BookshelfState>) {
        ObjectUtil.assignOwnProperties<BookshelfState>(this, data);
    }
}
