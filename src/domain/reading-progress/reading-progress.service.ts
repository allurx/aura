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

import ReadingProgressRepository from "./reading-progress.repository";
import ReadingProgress from "./reading-progress.model";
import { readingProgressStore } from "../../core/database/database-definition";

/**
 * 阅读进度服务
 * @author allurx
 */
export default class ReadingProgressService {
    private readonly repository: ReadingProgressRepository;

    constructor() {
        this.repository = new ReadingProgressRepository();
    }

    /**
     * 更新阅读进度
     * @param readingProgress - 阅读进度
     * @param transaction - 事务对象
     */
    async update(readingProgress: ReadingProgress, transaction: IDBTransaction) {
        await this.repository.put(readingProgress, transaction);
    }

    /**
     * 根据书籍id删除阅读进度
     * @param bookId - 书籍id
     * @param transaction - 事务对象
     */
    async deleteByBookId(bookId: string, transaction: IDBTransaction) {
        await this.repository.deleteByIndex(readingProgressStore.indexes.ukBookId.name, bookId, transaction);
    }

    /**
     * 删除所有阅读进度
     * @param transaction - 事务对象
     */
    async clear(transaction: IDBTransaction) {
        await this.repository.clear(transaction);
    }

    /**
     * 根据书籍id获取阅读进度
     * @param bookId - 书籍id
     * @param transaction - 事务对象
     * @return 阅读进度
     */
    async getByBookId(bookId: string, transaction: IDBTransaction) {
        return await this.repository.getByIndex(readingProgressStore.indexes.ukBookId.name, bookId, transaction);
    }
}
