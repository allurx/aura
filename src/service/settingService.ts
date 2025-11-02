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

import { assertExists } from "../util/assertUtil.js";
import SettingDao from "../dao/settingDao.js";
import { settingStore } from "../core/database/DatabaseDefinition.js";

/**
 * 设置服务
 * @author allurx
 */
export default class SettingService {
    settingDao;

    constructor() {
        this.settingDao = new SettingDao();
    }

    /**
     * 添加设置
     * @param setting - 设置
     * @param transaction - 事务对象
     */
    async add(setting: object, transaction: IDBTransaction): Promise<void> {
        await this.settingDao.add(setting, transaction);
    }

    /**
     * 更新设置
     * @param setting - 设置
     * @param transaction - 事务对象
     * @return {Promise<void>}
     */
    async update(setting: object, transaction: IDBTransaction): Promise<void> {
        await this.settingDao.put(setting, transaction);
    }

    /**
     * 获取设置
     * @param name - 设置名称
     * @param  transaction - 事务对象
     * @param constructor - 设置构造函数
     * @return  设置
     */
    async get<T>(name: string, constructor: new (data: Partial<T>) => T, transaction: IDBTransaction): Promise<T> {
        const setting = await this.settingDao.getByIndex(settingStore.indexes.ukName.name, name, transaction);
        return new constructor(assertExists(setting));
    }

    /**
     * 计算设置数量
     * @param name - 设置名称
     * @param transaction - 事务对象
     * @return 设置数量
     */
    async count(name: string, transaction: IDBTransaction): Promise<number> {
        return this.settingDao.countByIndex(settingStore.indexes.ukName.name, name, transaction);
    }
}
