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

import FileDao from "../dao/fileDao.js";
import { fileStore } from "../core/database/DatabaseDefinition.js";

/**
 * 文件服务类
 * @author allurx
 */
export default class FileService {

    fileDao;

    constructor() {
        this.fileDao = new FileDao();
    }

    async save(bookFile, transaction) {
        return await this.fileDao.put(bookFile, transaction);
    }

    async clear(transaction) {
        return await this.fileDao.clear(transaction);
    }

    async getByHash(hash, transaction) {
        return await this.fileDao.getByIndex(fileStore.indexes.ukHash.name, hash, transaction);
    }

    async deleteById(fileId, transaction) {
        return await this.fileDao.deleteByKey(fileId, transaction);
    }

}