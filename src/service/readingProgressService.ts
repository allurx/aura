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

import ReadingProgressDao from "../dao/readingProgressDao.js";
import ReadingProgress from "../model/readingProgress.js";
import { readingProgressStore } from "../core/database/DatabaseDefinition.js";

/**
 * 阅读进度服务
 * @author allurx
 */
export default class ReadingProgressService {
    readingProgressDao;

    constructor() {
        this.readingProgressDao = new ReadingProgressDao();
    }

    /**
     * 更新阅读进度
     * @param readingProgress - 阅读进度
     * @param transaction - 事务对象
     */
    async update(readingProgress: ReadingProgress, transaction: IDBTransaction) {
        await this.readingProgressDao.put(readingProgress, transaction);
    }

    /**
     * 根据书籍id删除阅读进度
     * @param bookId - 书籍id
     * @param transaction - 事务对象
     */
    async deleteByBookId(bookId: string, transaction: IDBTransaction) {
        await this.readingProgressDao.deleteByIndex(readingProgressStore.indexes.ukBookId.name, bookId, transaction);
    }

    /**
     * 删除所有阅读进度
     * @param transaction - 事务对象
     */
    async clear(transaction: IDBTransaction) {
        await this.readingProgressDao.clear(transaction);
    }

    /**
     * 根据书籍id获取阅读进度
     * @param bookId - 书籍id
     * @param transaction - 事务对象
     * @return 阅读进度
     */
    async getByBookId(bookId: string, transaction: IDBTransaction) {
        return await this.readingProgressDao.getByIndex(
            readingProgressStore.indexes.ukBookId.name,
            bookId,
            transaction
        );
    }
}
