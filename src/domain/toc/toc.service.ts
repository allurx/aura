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

import TocRepository from "./toc.repository";
import Toc from "./toc.model";
import { tocStore } from "../../core/database/database-definition";

/**
 * 目录服务
 * @author allurx
 */
export default class TocService {
    private readonly repository: TocRepository;

    constructor() {
        this.repository = new TocRepository();
    }

    /**
     * 更新目录
     * @param  toc - 目录实例
     * @param  transaction - 事务对象
     */
    async update(toc: Toc, transaction: IDBTransaction) {
        return await this.repository.put(toc, transaction);
    }

    /**
     * 根据文件id删除目录
     * @param  fileId - 文件id
     * @param  transaction - 事务对象
     */
    async deleteByFileId(fileId: string, transaction: IDBTransaction) {
        await this.repository.deleteByIndex(tocStore.indexes.ukFileId.name, fileId, transaction);
    }

    /**
     * 删除所有目录
     * @param  transaction - 事务对象
     */
    async clear(transaction: IDBTransaction) {
        await this.repository.clear(transaction);
    }

    /**
     * 根据文件id获取目录
     * @param  fileId - 文件id
     * @param  transaction - 事务对象
     */
    async getByFileId(fileId: string, transaction: IDBTransaction) {
        return await this.repository.getByIndex(tocStore.indexes.ukFileId.name, fileId, transaction);
    }
}
