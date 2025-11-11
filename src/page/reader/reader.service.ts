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

import Progress from "../../domain/progress/progress.model";
import ReaderSetting from "../../domain/setting/reader-setting.model";
import BookService from "../../domain/book/book.service";
import ChapterService from "../../domain/chapter/chapter.service";
import ProgressService from "../../domain/progress/progress.service";
import TocService from "../../domain/toc/toc.service";
import SettingService from "../../domain/setting/setting.service";
import TransactionManager from "../../core/database/transaction-manager";
import { SettingName } from "../../core/component/constant/setting.name";
import { DatabaseMode } from "../../core/constant/database-mode";
import {
    bookStore,
    tocStore,
    chapterStore,
    progressStore,
    settingStore,
} from "../../core/database/database-definition";
import ReaderState from "./reader.state";
import { assertExists } from "../../core/util/assert.util";

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

                // 并行加载数据
                const [
                    toc,
                    readerSetting,
                    readerHeaderSetting,
                    readerContentSetting,
                    readerFooterSetting,
                    readerDocSetting,
                    readerTocSetting,
                    { progress, chapter },
                ] = await Promise.all([
                    this.tocService
                        .getByIndex(tocStore.indexes.ukFileId.name, book.fileId, transaction)
                        .then((result) => assertExists(result, `Toc[fileId=${book.fileId}] not found`)),
                    this.settingService.getReaderSetting(SettingName.READER, transaction),
                    this.settingService.getReaderSetting(SettingName.READER_HEADER, transaction),
                    this.settingService.getReaderSetting(SettingName.READER_CONTENT, transaction),
                    this.settingService.getReaderSetting(SettingName.READER_FOOTER, transaction),
                    this.settingService.getReaderSetting(SettingName.READER_DOC, transaction),
                    this.settingService.getReaderSetting(SettingName.READER_TOC, transaction),
                    (async () => {
                        const progress = assertExists(
                            await this.progressService.getByIndex(
                                progressStore.indexes.ukBookId.name,
                                bookId,
                                transaction
                            ),
                            `Progress[bookId=${bookId}] not found`
                        );
                        const chapter = assertExists(
                            await this.chapterService.getByIndex(
                                chapterStore.indexes.ukFileIdIndex.name,
                                [book.fileId, progress.chapterIndex],
                                transaction
                            ),
                            `Chapter[fileId=${book.fileId}, index=${String(progress.chapterIndex)}] not found`
                        );
                        return { progress, chapter };
                    })(),
                ]);

                return new ReaderState({
                    book,
                    toc,
                    settings: [
                        readerSetting,
                        readerHeaderSetting,
                        readerContentSetting,
                        readerFooterSetting,
                        readerDocSetting,
                        readerTocSetting,
                    ]
                        .filter((setting) => setting !== null)
                        .reduce((map, setting) => {
                            map.set(setting.name, setting);
                            return map;
                        }, new Map<SettingName, ReaderSetting>()),
                    progress: progress,
                    chapter,
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
