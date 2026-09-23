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
 * 章节
 * @author allurx
 */
export default class Chapter extends BaseModel {
    public readonly fileId!: string;
    public readonly chapterNumber!: number;
    public readonly title!: string;
    public readonly lines!: string[];

    // 本章节在整本书中的起始物理行号
    public readonly startBookLineNumber!: number;

    // 本章节在整本书中的结束物理行号
    public readonly endBookLineNumber!: number;

    public constructor(data: ClassFields<Chapter>) {
        super();
        ObjectUtil.assignOwnProperties<Chapter>(this, data);
    }

    /**
     * @return {string} 整个章节内容
     */
    public content(): string {
        return this.lines.join("\n");
    }

    /**
     * 将章节内正文行号转换为全书物理行号。
     * @param chapterLineNumber - 当前章节内的正文行号，从 1 开始
     * @returns 对应的全书物理行号
     */
    public toBookLineNumber(chapterLineNumber: number): number {
        return this.endBookLineNumber - this.lines.length + chapterLineNumber;
    }
}
