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

import Aura from "../core/aura.js";
import ReaderSetting from "../model/readerSetting.js";
import SettingDao from "../dao/settingDao.js";
import { settingStore } from "../core/database/DatabaseDefinition.js";

/**
 * 阅读器设置服务
 * @author allurx
 */
export default class ReaderSettingService {


    /** 
     * 设置数据访问对象
     * @type {SettingDao}  
    */
    settingDao;

    constructor() {
        this.settingDao = new SettingDao();
    }

    /**
     * 保存阅读器设置
     * @param {ReaderSetting} readerSetting - 阅读器设置
     * @param {IDBTransaction} transaction - 事务对象
     * @return {Promise<void>}
     */
    async saveReaderSetting(readerSetting, transaction) {
        await this.settingDao.put(readerSetting, transaction);
    }

    /** 
     * 获取阅读器设置
     * @param {IDBTransaction} transaction - 事务对象
     * @return {Promise<ReaderSetting>} 阅读器设置
     */
    async getReaderSetting(transaction) {
        const readerSetting = await this.settingDao.getByIndex(settingStore.indexes.ukName.name, "reader-setting", transaction);
        return readerSetting ? new ReaderSetting(readerSetting) : Aura.reader.setting;
    }

}