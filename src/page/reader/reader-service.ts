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

import Progress from "../../domain/progress/progress-model";
import ReaderSetting from "../../domain/setting/reader-setting-model";
import BookService from "../../domain/book/book-service";
import ChapterService from "../../domain/chapter/chapter-service";
import ProgressService from "../../domain/progress/progress-service";
import TocService from "../../domain/toc/toc-service";
import SettingService from "../../domain/setting/setting-service";
import TransactionManager from "../../core/database/transaction-manager";
import { SettingName } from "../../core/component/constant/setting-name";
import { DatabaseMode } from "../../core/constant/database-mode";
import {
    bookStore,
    tocStore,
    chapterStore,
    progressStore,
    settingStore,
} from "../../core/database/database-definition";
import ReaderState from "./reader-state";
import { assertExists } from "../../core/util/assert-util";
import { PageName } from "../../core/constant/page-name";

/**
 * 阅读器服务
 * @author allurx
 */
export default class ReaderService {
    private readonly bookService: BookService;
    private readonly chapterService: ChapterService;
    private readonly progressService: ProgressService;
    private readonly tocService: TocService;
    private readonly settingService: SettingService;

    public constructor() {
        this.progressService = new ProgressService();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.tocService = new TocService();
        this.settingService = new SettingService();
    }

    /**
     * 初始化阅读器
     * @param bookId - 书籍id
     */
    public async init(bookId: string) {
        // 加载数据
        return await TransactionManager.runTransaction(
            [bookStore.name, tocStore.name, chapterStore.name, progressStore.name, settingStore.name],
            DatabaseMode.READ_ONLY,
            async (transaction) => {
                const book = assertExists(
                    await this.bookService.getByKey(bookId, transaction),
                    `Book[${bookId}] not found`
                );
                const progress = assertExists(
                    await this.progressService.getByIndex(progressStore.indexes.ukBookId.name, bookId, transaction),
                    `Progress[bookId=${bookId}] not found`
                );

                // 并行加载数据
                const [toc, readerSettings, chapter] = await Promise.all([
                    this.tocService.getByIndex(tocStore.indexes.ukFileId.name, book.fileId, transaction),
                    this.settingService.getReaderSettings(PageName.READER, transaction),
                    this.chapterService.getByIndex(
                        chapterStore.indexes.ukFileIdIndex.name,
                        [book.fileId, progress.chapterIndex],
                        transaction
                    ),
                ]);

                return new ReaderState({
                    book,
                    toc: assertExists(toc, `Toc[fileId=${book.fileId}] not found`),
                    settings: new Map<SettingName, ReaderSetting>(
                        readerSettings.map((setting) => [setting.name, setting])
                    ),
                    progress: progress,
                    chapter: assertExists(
                        chapter,
                        `Chapter[fileId=${book.fileId}, index=${String(progress.chapterIndex)}] not found`
                    ),
                });
            }
        );
    }

    /**
     * 更新阅读进度
     * @param progress - 阅读进度对象
     */
    public async updateProgress(progress: Progress) {
        await TransactionManager.runTransaction(progressStore.name, DatabaseMode.READ_WRITE, async (transaction) => {
            await this.progressService.update(progress, transaction);
        });
    }

    /**
     * 更新阅读器设置并保存
     * @param readerSetting - 阅读器设置对象
     */
    public async updateSetting(readerSetting: ReaderSetting) {
        await TransactionManager.runTransaction(settingStore.name, DatabaseMode.READ_WRITE, async (transaction) => {
            await this.settingService.update(readerSetting, transaction);
        });
    }

    /**
     * 删除阅读器设置
     */
    public async deleteSettings(settingNames: SettingName[]) {
        await TransactionManager.runTransaction(settingStore.name, DatabaseMode.READ_WRITE, async (transaction) => {
            const deletePromises = settingNames.map((name) =>
                this.settingService.deleteByIndex(settingStore.indexes.ukName.name, name, transaction)
            );
            await Promise.all(deletePromises);
        });
    }

    /**
     * 获取章节
     * @param fileId - 书籍文件id
     * @param chapterIndex - 章节索引
     */
    public async getChapter(fileId: string, chapterIndex: number) {
        return assertExists(
            await TransactionManager.runTransaction(
                chapterStore.name,
                DatabaseMode.READ_ONLY,
                async (transaction) =>
                    await this.chapterService.getByIndex(
                        chapterStore.indexes.ukFileIdIndex.name,
                        [fileId, chapterIndex],
                        transaction
                    )
            ),
            `Chapter[fileId=${fileId}, index=${String(chapterIndex)}] not found`
        );
    }
}
