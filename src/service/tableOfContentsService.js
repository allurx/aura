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

import TableOfContentsDao from "../dao/tableOfContentsDao.js";
import TableOfContents from "../model/tableOfContents.js";
import { tableOfContentsStore } from "../core/database/DatabaseDefinition.js";

/**
 * 目录服务
 * @author allurx
 */
export default class TableOfContentsService {

    /** 
     * 目录数据访问对象
     * @type {TableOfContentsDao}  
    */
    tableOfContentsDao;

    constructor() {
        this.tableOfContentsDao = new TableOfContentsDao();
    }

    /** 
     * 保存目录
     * @param {TableOfContents} tableOfContents - 目录实例
     * @param {IDBTransaction} transaction - 事务对象
     */
    async save(tableOfContents, transaction) {
        return await this.tableOfContentsDao.put(tableOfContents, transaction);
    }

    /** 
     * 根据文件id删除目录
     * @param {string} fileId - 文件id
     * @param {IDBTransaction} transaction - 事务对象
     */
    async deleteByFileId(fileId, transaction) {
        return await this.tableOfContentsDao.deleteByIndex(tableOfContentsStore.indexes.ukFileId.name, fileId, transaction);
    }

    /** 
     * 删除所有目录
     * @param {IDBTransaction} transaction - 事务对象
     */
    async clear(transaction) {
        return await this.tableOfContentsDao.clear(transaction);
    }

    /** 
     * 根据文件id获取目录
     * @param {string} fileId - 文件id
     * @param {IDBTransaction} transaction - 事务对象
     */
    async getTocByFileId(fileId, transaction) {
        return await this.tableOfContentsDao.getByIndex(tableOfContentsStore.indexes.ukFileId.name, fileId, transaction);
    }


}