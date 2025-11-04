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

import FileRepository from "./file.repository";
import { fileStore } from "../../core/database/database-definition";
import BookFile from "./file.model";

/**
 * 文件服务类
 * @author allurx
 */
export default class FileService {
    private readonly repository: FileRepository;

    public constructor() {
        this.repository = new FileRepository();
    }

    public async add(bookFile: BookFile, transaction: IDBTransaction) {
        return await this.repository.add(bookFile, transaction);
    }

    public async clear(transaction: IDBTransaction) {
        await this.repository.clear(transaction);
    }

    public async getByHash(hash: string, transaction: IDBTransaction) {
        return await this.repository.getByIndex(fileStore.indexes.ukHash.name, hash, transaction);
    }

    public async deleteById(fileId: string, transaction: IDBTransaction) {
        await this.repository.deleteByKey(fileId, transaction);
    }
}
