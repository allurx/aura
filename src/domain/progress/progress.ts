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
import type { ClassFields } from "@/types/class-fields";
import ObjectUtil from "@/utils/object-util";

/**
 * 阅读进度
 * @author allurx
 */
export default class Progress extends BaseModel {
    public readonly bookId!: string;
    public readonly chapterNumber!: number;
    public readonly chapterLineNumber!: number;

    // 行元素可见比例 (0 ~ 1),用于恢复阅读时滚动到精确位置
    public readonly lineVisibleRatio!: number;

    public constructor(data: ClassFields<Progress>) {
        super();
        ObjectUtil.assignOwnProperties<Progress>(this, data);
    }
}
