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
import CategoryDao from "../dao/categoryDao.js";
import Category from "../model/Category.js";

/**
 * 分类服务
 * @author allurx
 */
export default class CategoryService {
    categoryDao;

    constructor() {
        this.categoryDao = new CategoryDao();
    }

    /**
     * 保存分类
     * @param categories 分类列表
     * @param transaction 事务
     */
    async addAll(categories: Category[], transaction: IDBTransaction) {
        return await this.categoryDao.addAll(categories, transaction);
    }

    /**
     * 获取所有分类
     * @param transaction 事务
     */
    async getAll(transaction: IDBTransaction) {
        return await this.categoryDao.getAll(transaction);
    }

    /**
     * 统计分类数量
     * @param transaction 事务
     */
    async count(transaction: IDBTransaction) {
        return await this.categoryDao.count(transaction);
    }
}
