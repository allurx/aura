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

import Chapter from "../model/chapter.js";
import ChapterDao from "../dao/chapterDao.js";
import { chapterStore } from "../core/database/DatabaseDefinition.js";

/**
 * 章节服务
 * @author allurx
 */
export default class ChapterService {
    chapterDao;

    constructor() {
        this.chapterDao = new ChapterDao();
    }

    /**
     * 批量添加章节
     * @param chapters - 章节数组
     * @param transaction - 事务对象
     */
    async addAll(chapters: Chapter[], transaction: IDBTransaction) {
        return await this.chapterDao.addAll(chapters, transaction);
    }

    /**
     * 根据文件id删除章节
     * @param fileId - 所属文件id
     * @param transaction - 事务对象
     */
    async deleteByFileId(fileId: string, transaction: IDBTransaction) {
        await this.chapterDao.deleteAllByIndex(chapterStore.indexes.idxFileId.name, fileId, transaction);
    }

    /**
     * 删除所有章节
     * @param transaction - 事务对象
     */
    async clear(transaction: IDBTransaction) {
        await this.chapterDao.clear(transaction);
    }

    /**
     * 根据文件id和章节索引获取章节
     * @param fileId - 文件id
     * @param index - 章节索引
     * @param transaction - 事务对象
     * @return 章节
     */
    async getByFileIdAndIndex(fileId: string, index: number, transaction: IDBTransaction) {
        return await this.chapterDao.getByIndex(chapterStore.indexes.ukFileIdIndex.name, [fileId, index], transaction);
    }
}
