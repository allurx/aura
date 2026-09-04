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

import type { ClassFields } from "@/type/class-fields";
import ObjectUtil from "@/util/object-util";

/**
 * 目录条目
 * @author allurx
 */
export default class TocEntry {
    // 章节序号，从 1 开始
    public readonly chapterNumber!: number;

    // 目录标题
    public readonly title!: string;

    // 章节在整本书中的起始物理行号
    public readonly startBookLineNumber!: number;

    // 章节在整本书中的结束物理行号
    public readonly endBookLineNumber!: number;

    /**
     * 创建目录条目
     * @param data - 目录条目字段
     */
    public constructor(data: ClassFields<TocEntry>) {
        ObjectUtil.assignOwnProperties<TocEntry>(this, data);
    }
}
