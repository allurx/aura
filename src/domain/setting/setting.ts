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

import { ClassFields } from "../../core/type/common-type";
import { UiId } from "../../core/component/ui-id";
import { PageName } from "../../core/constant/page-name";
import BaseModel from "../base-model";

/**
 * 阅读器设置
 * @author allurx
 */
export default class Setting extends BaseModel {
    public readonly uiId!: UiId;
    public readonly pageName!: PageName;
    [key: string]: unknown;

    public constructor(data: ClassFields<Setting>) {
        super();
        // 设置项是动态的,使用Object.assign赋值
        Object.assign(this, data);
    }
}
