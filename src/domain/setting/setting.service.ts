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

import { settingStore } from "../../core/database/database-definition";
import SettingRepository from "./setting.repository";
import BaseService from "../base.service";
import { SettingName } from "../../core/constant/setting.name";
import ReaderSetting from "./reader-setting.model";

/**
 * 设置服务
 * @author allurx
 */
export default class SettingService extends BaseService<ReaderSetting> {
    public constructor() {
        super(new SettingRepository());
    }

    /**
     * 获取设置
     * @param names - 设置名称
     * @param  transaction - 事务对象
     * @param constructor - 设置构造函数
     * @return  设置
     */
    public async getReaderSetting(name: SettingName, transaction: IDBTransaction): Promise<ReaderSetting | null> {
        const setting = await this.getByIndex(settingStore.indexes.ukName.name, name, transaction);
        return setting ? new ReaderSetting(setting) : null;
    }
}
