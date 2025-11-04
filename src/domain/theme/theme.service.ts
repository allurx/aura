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

import ThemeRepository from "./theme.repository";
import Theme from "./theme.model";

/**
 * 主题服务
 * @author allurx
 */
export default class ThemeService {
    private readonly repository: ThemeRepository;
    constructor() {
        this.repository = new ThemeRepository();
    }

    /**
     * 添加多个主题
     * @param themes 主题列表
     * @param transaction 事务
     */
    async addAll(themes: Theme[], transaction: IDBTransaction) {
        await this.repository.addAll(themes, transaction);
    }

    /**
     * 获取所有主题
     * @param transaction 事务
     */
    async getAll(transaction: IDBTransaction) {
        return await this.repository.getAll(transaction);
    }

    /**
     * 统计主题数量
     * @param transaction 事务
     */
    async count(transaction: IDBTransaction) {
        return await this.repository.count(transaction);
    }
}
