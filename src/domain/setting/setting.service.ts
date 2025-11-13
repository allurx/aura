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
import { PageName } from "../../core/constant/page-name";
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
     * 获取阅读器设置
     * @param pageName - 页面名称
     * @param  transaction - 事务对象
     * @return  阅读器设置列表
     */
    public async getReaderSettings(pageName: PageName, transaction: IDBTransaction): Promise<ReaderSetting[]> {
        return await this.getAllByIndex(settingStore.indexes.idxPageName.name, pageName, transaction);
    }
}
