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

import SettingRepository from "./setting-repository";
import BaseService from "@/domain/base-service";
import Setting from "./setting";
import { PageName } from "@/constant/page-name";
import TransactionManager from "@/database/transaction-manager";
import { DatabaseMode } from "@/database/database-mode";
import { settingStore } from "@/database/database-definition";

/**
 * 设置服务
 * @author allurx
 */
export default class SettingService extends BaseService<Setting> {
    public constructor() {
        super(new SettingRepository());
    }

    /**
     * 加载指定页面的全部设置。
     */
    public async loadPage(pageName: PageName): Promise<Setting[]> {
        return await TransactionManager.runTransaction(
            settingStore.name,
            DatabaseMode.READ_ONLY,
            async (transaction) =>
                await this.getAllByIndex(settingStore.indexes.idxPageName.name, pageName, transaction)
        );
    }

    /**
     * 保存一条设置记录。
     */
    public async save(setting: Setting): Promise<void> {
        await TransactionManager.runTransaction(settingStore.name, DatabaseMode.READ_WRITE, async (transaction) => {
            await this.update(setting, transaction);
        });
    }

    /**
     * 删除指定页面的全部设置。
     */
    public async resetPage(pageName: PageName): Promise<void> {
        await TransactionManager.runTransaction(settingStore.name, DatabaseMode.READ_WRITE, async (transaction) => {
            await this.deleteAllByIndex(settingStore.indexes.idxPageName.name, pageName, transaction);
        });
    }
}
