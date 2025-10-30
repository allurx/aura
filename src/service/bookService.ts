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

import Book from "../model/book.js";
import BookDao from "../dao/bookDao.js";
import { bookStore } from "../core/database/DatabaseDefinition.js";

/**
 * 书籍服务
 * @author allurx
 */
export default class BookService {
    bookDao;

    constructor() {
        this.bookDao = new BookDao();
    }

    /**
     * 保存书籍
     * @param book - 书籍实例
     * @param transaction - 事务对象
     */
    async save(book: Book, transaction: IDBTransaction) {
        return await this.bookDao.put(book, transaction);
    }

    /**
     * 根据书籍id删除书籍
     * @param  bookId - 书籍id
     * @param transaction - 事务对象
     */
    async deleteById(bookId: string, transaction: IDBTransaction) {
        await this.bookDao.deleteByKey(bookId, transaction);
    }

    /**
     * 删除所有书籍
     * @param  transaction - 事务对象
     */
    async clear(transaction: IDBTransaction) {
        await this.bookDao.clear(transaction);
    }

    /**
     * 根据书籍id获取书籍
     * @param bookId - 书籍id
     * @param transaction - 事务对象
     * @returns 书籍实例
     */
    async getById(bookId: string, transaction: IDBTransaction) {
        return await this.bookDao.getByKey(bookId, transaction);
    }

    /**
     * 根据书籍类型id获取书籍列表
     * @param genreId - 书籍类型id
     * @param transaction - 事务对象
     * @returns 书籍实例列表
     */
    async listByGenreId(genreId: number, transaction: IDBTransaction) {
        return await this.bookDao.getAllByIndex(bookStore.indexes.idxGenreId.name, genreId, transaction);
    }

    /**
     * 统计指定书籍文件id关联的书籍数量
     * @param fileId - 书籍文件id
     * @param transaction - 事务对象
     * @returns 关联的书籍数量
     */
    async countByFileId(fileId: string, transaction: IDBTransaction): Promise<number> {
        return await this.bookDao.countByIndex(bookStore.indexes.idxFileId.name, fileId, transaction);
    }
}
