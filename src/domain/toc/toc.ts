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
import { ClassFields } from "@/type/common-type";
import ObjectUtil from "@/util/object-util";

/**
 * 目录
 * @author allurx
 */
export default class Toc extends BaseModel {
    public readonly fileId!: string;
    public readonly contents!: InstanceType<typeof Toc.Content>[];

    public constructor(data: ClassFields<Toc>) {
        super();
        ObjectUtil.assignOwnProperties<Toc>(this, data);
    }

    /**
     * 章节数量
     */
    public numberOfChapters() {
        return this.contents.length;
    }

    /**
     * 全书物理总行数
     */
    public numberOfLines() {
        return this.contents[this.contents.length - 1]?.endBookLineNumber ?? 0;
    }

    /**
     * 目录内容
     */
    public static Content = class Content {
        // 章节序号，从 1 开始
        public readonly chapterNumber!: number;
        // 目录标题
        public readonly title!: string;
        // 章节在整本书中的起始物理行号
        public readonly startBookLineNumber!: number;
        // 章节在整本书中的结束物理行号
        public readonly endBookLineNumber!: number;

        public constructor(data: ClassFields<Content>) {
            ObjectUtil.assignOwnProperties<Content>(this, data);
        }
    };
}
