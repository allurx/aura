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
import Book from "../../domain/book/book.model";
import Chapter from "../../domain/chapter/chapter.model";
import Toc from "../../domain/toc/toc.model";
import ReaderSetting from "../../domain/setting/reader-setting.model";
import Progress from "../../domain/progress/progress.model";
import ObjectUtil from "../../core/util/object.util";
import { SettingName } from "../../core/component/constant/setting.name";

/**
 * 阅读器状态
 * @author allurx
 */
export default class ReaderState {
    public readonly book!: Book;
    public readonly toc!: Toc;
    public readonly settings!: Map<SettingName, ReaderSetting>;
    public readonly progress!: Progress;
    public chapter!: Chapter;

    public constructor(data: Required<ReaderState>) {
        ObjectUtil.assignOwnProperties<ReaderState>(this, data);
    }
}
