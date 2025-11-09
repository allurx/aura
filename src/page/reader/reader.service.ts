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

import ReadingProgress from "../../domain/reading-progress/reading-progress.model";
import ReaderSetting from "../../domain/setting/reader-setting.model";
import BookService from "../../domain/book/book.service";
import ChapterService from "../../domain/chapter/chapter.service";
import ReadingProgressService from "../../domain/reading-progress/reading-progress.service";
import TocService from "../../domain/toc/toc.service";
import SettingService from "../../domain/setting/setting.service";
import TransactionManager from "../../core/database/transaction-manager";
import { SettingName } from "../../core/constant/setting.name";
import { DatabaseMode } from "../../core/constant/database-mode";
import {
    bookStore,
    tocStore,
    chapterStore,
    readingProgressStore,
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
    private readonly readingProgressService: ReadingProgressService;
    private readonly tocService: TocService;
    private readonly settingService: SettingService;

    public constructor() {
        this.readingProgressService = new ReadingProgressService();
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
            [bookStore.name, tocStore.name, chapterStore.name, readingProgressStore.name, settingStore.name],
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
                    { readingProgress, chapter },
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
                        const readingProgress = assertExists(
                            await this.readingProgressService.getByIndex(
                                readingProgressStore.indexes.ukBookId.name,
                                bookId,
                                transaction
                            ),
                            `ReadingProgress[bookId=${bookId}] not found`
                        );
                        const chapter = assertExists(
                            await this.chapterService.getByIndex(
                                chapterStore.indexes.ukFileIdIndex.name,
                                [book.fileId, readingProgress.chapterIndex],
                                transaction
                            ),
                            `Chapter[fileId=${book.fileId}, index=${String(readingProgress.chapterIndex)}] not found`
                        );
                        return { readingProgress, chapter };
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
                    readingProgress,
                    chapter,
                });
            }
        );
    }

    /**
     * 更新阅读进度
     * @param readingProgress - 阅读进度对象
     */
    public async updateReadingProgress(readingProgress: ReadingProgress) {
        await TransactionManager.runTransaction(
            readingProgressStore.name,
            DatabaseMode.READ_WRITE,
            async (transaction) => {
                await this.readingProgressService.update(readingProgress, transaction);
            }
        );
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
