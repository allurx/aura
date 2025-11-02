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

import BookService from "../../service/bookService.js";
import ChapterService from "../../service/chapterService.js";
import ReadingProgressService from "../../service/readingProgressService.js";
import TableOfContentsService from "../../service/tableOfContentsService.js";
import SettingService from "../../service/settingService.js";
import ReaderUi from "./readerUi.js";
import Book from "../../model/book.js";
import Chapter from "../../model/chapter.js";
import TableOfContents from "../../model/tableOfContents.js";
import ReaderSetting from "../../model/readerSetting.js";
import ReadingProgress from "../../model/readingProgress.js";
import TransactionManager from "../../core/database/transactionManager.js";
import {
    bookStore,
    tableOfContentsStore,
    chapterStore,
    readingProgressStore,
    settingStore,
} from "../../core/database/DatabaseDefinition.js";
import { assertExists } from "../../util/assertUtil.js";

/**
 * 阅读器控制器
 * @author allurx
 */
export default class ReaderController {
    book!: Book;
    toc!: TableOfContents;
    chapter!: Chapter;
    readerSetting!: ReaderSetting;
    readingProgress!: ReadingProgress;
    defaultReaderSetting!: ReaderSetting;

    bookService: BookService;
    chapterService: ChapterService;
    readingProgressService: ReadingProgressService;
    tableOfContentsService: TableOfContentsService;
    settingService: SettingService;

    readerUi: ReaderUi;

    constructor() {
        this.readerUi = new ReaderUi();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.readingProgressService = new ReadingProgressService();
        this.tableOfContentsService = new TableOfContentsService();
        this.settingService = new SettingService();
    }

    /**
     * 初始化阅读器
     * @param bookId - 书籍id
     */
    async init(bookId: string) {
        // 加载数据
        await TransactionManager.runTransaction(
            [
                bookStore.name,
                tableOfContentsStore.name,
                chapterStore.name,
                readingProgressStore.name,
                settingStore.name,
            ],
            "readonly",
            async (transaction) => {
                this.book = assertExists(
                    await this.bookService.getById(bookId, transaction),
                    `book not found, id: ${bookId}`
                );

                // 并行加载数据
                await Promise.all([
                    this.tableOfContentsService
                        .getByFileId(this.book.fileId, transaction)
                        .then((toc) => (this.toc = assertExists(toc))),
                    this.settingService
                        .get("defaultReaderSetting", ReaderSetting, transaction)
                        .then((readerSetting) => {
                            this.defaultReaderSetting = readerSetting;
                        }),
                    this.settingService.get("readerSetting", ReaderSetting, transaction).then((readerSetting) => {
                        this.readerSetting = readerSetting;
                    }),
                    this.readingProgressService.getByBookId(bookId, transaction).then(async (readingProgress) => {
                        this.readingProgress = assertExists(readingProgress);
                        this.chapter = assertExists(
                            await this.chapterService.getByFileIdAndIndex(
                                this.book.fileId,
                                this.readingProgress.chapterIndex,
                                transaction
                            )
                        );
                    }),
                ]);
            }
        );

        // 渲染界面
        // 注意这里虽然是先渲染界面然后再绑定事件，但是由于浏览器的渲染机制，
        // render函数内部修改ui导致的ContentScroll和ReaderResize事件会在未来的某一刻被触发，这个时刻无法确定，由浏览器自己决定。
        // 从而导致bindContentScroll和observeReaderResize对应的事件处理函数会在页面首次加载之后某一时刻被调用，
        // 也就是saveReadingProgress和saveReaderSetting被调用一次，这个无副作用的调用是可以接受的，因为只是重复保存了一下。
        // 目前还没有发现可以避免这种情况的好办法
        this.readerUi.render(this.readerSetting, this.toc, this.chapter, this.readingProgress);

        // 绑定事件
        this.bindEvent();
    }

    /**
     * 加载章节
     */
    async loadChapter() {
        // 获取章节
        this.chapter = await TransactionManager.runTransaction(chapterStore.name, "readonly", async (transaction) =>
            assertExists(
                await this.chapterService.getByFileIdAndIndex(
                    this.book.fileId,
                    this.readingProgress.chapterIndex,
                    transaction
                )
            )
        );

        // 渲染界面
        this.readerUi
            .renderChapter(this.chapter.lines)
            .renderChapterTitle(this.chapter.title)
            .renderReadingProgress(
                this.chapter.startLineNumber + this.readingProgress.lineIndex,
                this.toc.numberOfLines()
            )
            .restoreReadingProgress(this.readingProgress.lineIndex, this.readingProgress.lineVisibleRatio)
            .highlightCurrentChapter(this.readingProgress.chapterIndex);
    }

    /**
     * 更新阅读进度并保存
     * @param readingProgress - 阅读进度对象
     */
    async saveReadingProgress(readingProgress: Partial<ReadingProgress>) {
        await TransactionManager.runTransaction(readingProgressStore.name, "readwrite", async (transaction) => {
            this.readingProgress.update(readingProgress);
            await this.readingProgressService.update(this.readingProgress, transaction);
        });
    }

    /**
     * 更新阅读器设置并保存
     * @param readerSetting - 阅读器设置对象
     */
    async saveReaderSetting(readerSetting: Partial<ReaderSetting>) {
        await TransactionManager.runTransaction(settingStore.name, "readwrite", async (transaction) => {
            this.readerSetting.update(readerSetting);
            await this.settingService.update(this.readerSetting, transaction);
        });
    }

    /**
     * 绑定ui事件
     */
    bindEvent() {
        this.readerUi

            // 目录ui事件
            .bindCloseTocPanel()
            .bindToggleTocPanel(() => this.readerUi.highlightCurrentChapter(this.readingProgress.chapterIndex))
            .bindTocItemClick(async (chapterIndex) => {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.saveReadingProgress({ chapterIndex, lineIndex: 1, lineVisibleRatio: 1 });
                    await this.loadChapter();
                });
            })

            // 设置ui事件
            .bindToggleSettingPanel()
            .bindCloseSettingPanel()
            .bindResetSetting(async () => {
                const newSetting = new ReaderSetting(this.defaultReaderSetting).update({
                    id: this.readerSetting.id,
                    name: this.readerSetting.name,
                });
                this.readerUi.renderSettingPanel(newSetting);
                await this.saveReaderSetting(newSetting);
            })

            // 设置变更事件
            .bindFontSizeChange((fontSize) => this.saveReaderSetting({ fontSize }))
            .bindWidthChange((pageWidth) => this.saveReaderSetting({ pageWidth }))
            .bindPaddingChange((pagePadding) => this.saveReaderSetting({ pagePadding }))
            .bindLineHeightChange((lineHeight) => this.saveReaderSetting({ lineHeight }))
            .bindFontColorChange((fontColor) => this.saveReaderSetting({ fontColor }))
            .bindReaderBackgroundColorChange((readerBackgroundColor) =>
                this.saveReaderSetting({ readerBackgroundColor })
            )
            .bindBackgroundColorChange((backgroundColor) => this.saveReaderSetting({ backgroundColor }))

            // 其它事件
            .bindToggleFullscreen()
            .observeReaderResize((pageWidth) => this.saveReaderSetting({ pageWidth }))
            .bindChapterNavigation(this.switchChapter.bind(this))
            .bindContentScroll(async (lineIndex, lineVisibleRatio) => {
                await this.saveReadingProgress({ lineIndex, lineVisibleRatio });
                this.readerUi.renderReadingProgress(this.chapter.startLineNumber + lineIndex, this.toc.numberOfLines());
            });
    }

    /**
     * 切换章节
     * @param  direction - 方向
     */
    async switchChapter(direction: "prev" | "next") {
        if (direction === "prev") {
            if (this.readingProgress.chapterIndex === 1) {
                await this.readerUi.dialog.alert("已经是第一章了");
            } else {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.saveReadingProgress({
                        chapterIndex: this.readingProgress.chapterIndex - 1,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                    });
                    await this.loadChapter();
                });
            }
        } else {
            if (this.readingProgress.chapterIndex === this.toc.numberOfChapters()) {
                await this.readerUi.dialog.alert("已经是最后一章了");
            } else {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.saveReadingProgress({
                        chapterIndex: this.readingProgress.chapterIndex + 1,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                    });
                    await this.loadChapter();
                });
            }
        }
    }
}
