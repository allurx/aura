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
import ObjectUtil from "../../core/util/object.util";

/**
 * 阅读器设置
 * @author allurx
 */
export default class ReaderSetting extends BaseModel {
    public readonly name!: string;
    public fontSize!: number;
    public pageWidth!: number;
    public pagePadding!: number;
    public lineHeight!: number;
    public fontColor!: string;
    public readerBackgroundColor!: string;
    public backgroundColor!: string;

    public constructor(data: ClassFields<ReaderSetting>) {
        super();
        ObjectUtil.assignOwnProperties<ReaderSetting>(this, data);
    }
}
