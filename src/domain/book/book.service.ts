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

import Book from "./book.model";
import BookRepository from "./book.repository";
import { bookStore } from "../../core/database/database-definition";

/**
 * 书籍服务
 * @author allurx
 */
export default class BookService {
    private readonly repository: BookRepository;

    public constructor() {
        this.repository = new BookRepository();
    }

    /**
     * 添加书籍
     * @param book - 书籍实例
     * @param transaction - 事务对象
     */
    public async add(book: Book, transaction: IDBTransaction) {
        return await this.repository.add(book, transaction);
    }

    /**
     * 根据书籍id删除书籍
     * @param  bookId - 书籍id
     * @param transaction - 事务对象
     */
    public async deleteById(bookId: string, transaction: IDBTransaction) {
        await this.repository.deleteByKey(bookId, transaction);
    }

    /**
     * 删除所有书籍
     * @param  transaction - 事务对象
     */
    public async clear(transaction: IDBTransaction) {
        await this.repository.clear(transaction);
    }

    /**
     * 根据书籍id获取书籍
     * @param bookId - 书籍id
     * @param transaction - 事务对象
     * @returns 书籍实例
     */
    public async getById(bookId: string, transaction: IDBTransaction) {
        return await this.repository.getByKey(bookId, transaction);
    }

    /**
     * 根据书籍类型id获取书籍列表
     * @param categoryId - 书籍类型id
     * @param transaction - 事务对象
     * @returns 书籍实例列表
     */
    public async getAllByCategoryId(categoryId: string, transaction: IDBTransaction) {
        return await this.repository.getAllByIndex(bookStore.indexes.idxCategoryId.name, categoryId, transaction);
    }

    /**
     * 统计指定书籍文件id关联的书籍数量
     * @param fileId - 书籍文件id
     * @param transaction - 事务对象
     * @returns 关联的书籍数量
     */
    public async countByFileId(fileId: string, transaction: IDBTransaction): Promise<number> {
        return await this.repository.countByIndex(bookStore.indexes.idxFileId.name, fileId, transaction);
    }
}
