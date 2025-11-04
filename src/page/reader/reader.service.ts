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

import { assertExists } from "../../core/util/assert.util";
import ReadingProgress from "../../domain/reading-progress/reading-progress.model";
import ReaderSetting from "../../domain/setting/reader-setting.model";
import BookService from "../../domain/book/book.service";
import ChapterService from "../../domain/chapter/chapter.service";
import ReadingProgressService from "../../domain/reading-progress/reading-progress.service";
import TocService from "../../domain/toc/toc.service";
import SettingService from "../../domain/setting/setting.service";
import TransactionManager from "../../core/database/transaction-manager";
import { SettingEnum } from "../../core/constant/setting.enum";
import { DatabaseModeEnum } from "../../core/constant/database-mode.enum";
import {
    bookStore,
    tocStore,
    chapterStore,
    readingProgressStore,
    settingStore,
} from "../../core/database/database-definition";
import ReaderState from "./reader.state";

/**
 * 阅读器服务
 * @author allurx
 */
export default class ReaderService {
    private bookService: BookService;
    private chapterService: ChapterService;
    private readingProgressService: ReadingProgressService;
    private tableOfContentsService: TocService;
    private settingService: SettingService;

    constructor() {
        this.readingProgressService = new ReadingProgressService();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.tableOfContentsService = new TocService();
        this.settingService = new SettingService();
    }

    /**
     * 初始化阅读器
     * @param bookId - 书籍id
     */
    async init(bookId: string) {
        // 加载数据
        return await TransactionManager.runTransaction(
            [bookStore.name, tocStore.name, chapterStore.name, readingProgressStore.name, settingStore.name],
            DatabaseModeEnum.READ_ONLY,
            async (transaction) => {
                const book = assertExists(
                    await this.bookService.getById(bookId, transaction),
                    `book not found, id: ${bookId}`
                );

                // 并行加载数据
                const [toc, readerSetting, defaultReaderSetting, { readingProgress, chapter }] = await Promise.all([
                    this.tableOfContentsService.getByFileId(book.fileId, transaction),
                    this.settingService.get(SettingEnum.READER_SETTING, ReaderSetting, transaction),
                    this.settingService.get(SettingEnum.DEFAULT_READER_SETTING, ReaderSetting, transaction),
                    (async () => {
                        const readingProgress = assertExists(
                            await this.readingProgressService.getByBookId(bookId, transaction)
                        );
                        const chapter = assertExists(
                            await this.chapterService.getByFileIdAndIndex(
                                book.fileId,
                                readingProgress.chapterIndex,
                                transaction
                            )
                        );
                        return { readingProgress, chapter };
                    })(),
                ]);

                return new ReaderState({
                    book,
                    toc: assertExists(toc),
                    readerSetting,
                    defaultReaderSetting,
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
    async updateReadingProgress(readingProgress: ReadingProgress) {
        await TransactionManager.runTransaction(
            readingProgressStore.name,
            DatabaseModeEnum.READ_WRITE,
            async (transaction) => {
                await this.readingProgressService.update(readingProgress, transaction);
            }
        );
    }

    /**
     * 更新阅读器设置并保存
     * @param readerSetting - 阅读器设置对象
     */
    async updateReaderSetting(readerSetting: ReaderSetting) {
        await TransactionManager.runTransaction(settingStore.name, DatabaseModeEnum.READ_WRITE, async (transaction) => {
            await this.settingService.update(readerSetting, transaction);
        });
    }

    /**
     * 获取章节
     * @param fileId - 书籍文件id
     * @param chapterIndex - 章节索引
     */
    async getChapter(fileId: string, chapterIndex: number) {
        return await TransactionManager.runTransaction(
            chapterStore.name,
            DatabaseModeEnum.READ_ONLY,
            async (transaction) =>
                assertExists(await this.chapterService.getByFileIdAndIndex(fileId, chapterIndex, transaction))
        );
    }
}
