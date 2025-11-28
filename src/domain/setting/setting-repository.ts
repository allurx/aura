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

import Setting from "./setting";
import { settingStore } from "../../database/database-definition";
import BaseRepository from "../base-repository";

/**
 * 设置数据访问对象
 * @author allurx
 */
export default class SettingRepository extends BaseRepository<Setting> {
    public constructor() {
        super(settingStore, Setting);
    }
}
