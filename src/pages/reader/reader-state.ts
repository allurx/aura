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
import type Book from "@/domain/book/book";
import type Chapter from "@/domain/chapter/chapter";
import type Toc from "@/domain/toc/toc";
import type Progress from "@/domain/progress/progress";
import ObjectUtil from "@/utils/object-util";

/**
 * 阅读器状态
 * @author allurx
 */
export default class ReaderState {
    public readonly book!: Book;
    public readonly toc!: Toc;
    public readonly progress!: Progress;
    public chapter!: Chapter;

    /**
     * 接收完整领域状态并保留对象引用，当前章节可由切章流程替换。
     */
    public constructor(data: Required<ReaderState>) {
        ObjectUtil.assignOwnProperties<ReaderState>(this, data);
    }
}
