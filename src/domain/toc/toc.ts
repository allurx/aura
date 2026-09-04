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

import BaseModel from "@/domain/base-model";
import type { ClassFields } from "@/type/class-fields";
import ObjectUtil from "@/util/object-util";
import type TocEntry from "./toc-entry";

/**
 * 目录
 * @author allurx
 */
export default class Toc extends BaseModel {
    public readonly fileId!: string;
    public readonly entries!: TocEntry[];

    public constructor(data: ClassFields<Toc>) {
        super();
        ObjectUtil.assignOwnProperties<Toc>(this, data);
    }

    /**
     * 章节数量
     */
    public numberOfChapters() {
        return this.entries.length;
    }

    /**
     * 全书物理总行数
     */
    public numberOfLines() {
        return this.entries[this.entries.length - 1]?.endBookLineNumber ?? 0;
    }
}
