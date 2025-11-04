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

import BaseModel from "../base.model";
import { ClassFields } from "../../core/type/common.type";

/**
 * 目录
 * @author allurx
 */
export default class Toc extends BaseModel {
    readonly fileId!: string;
    readonly contents!: InstanceType<typeof Toc.Content>[];

    constructor(data: ClassFields<Toc>) {
        super();
        Object.assign(this, data);
    }

    /**
     * 章节数量
     */
    numberOfChapters() {
        return this.contents.length;
    }

    /**
     * 行数
     */
    numberOfLines() {
        return this.contents[this.contents.length - 1]?.endLineNumber ?? 0;
    }

    /**
     * 目录内容
     */
    static Content = class Content {
        // 目录索引
        readonly index!: number;
        // 目录标题
        readonly title!: string;
        // 章节起始行号
        readonly startLineNumber!: number;
        // 章节结束行号
        readonly endLineNumber!: number;

        /**
         * @param {Object} data - 初始化目录内容所需的所有字段
         */
        constructor(data: Partial<Content>) {
            Object.assign(this, data);
        }
    };
}
