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

import type Progress from "@/domain/progress/progress";
import BookService from "@/domain/book/book-service";
import ChapterService from "@/domain/chapter/chapter-service";
import ProgressService from "@/domain/progress/progress-service";
import TocService from "@/domain/toc/toc-service";
import TransactionManager from "@/database/transaction-manager";
import { DatabaseMode } from "@/database/database-mode";
import { bookStore, tocStore, chapterStore, progressStore } from "@/database/database-definition";
import ReaderState from "./reader-state";
import { assertExists } from "@/utils/assert-util";

/**
 * 阅读器服务
 * @author allurx
 */
export default class ReaderService {
    private readonly bookService: BookService;
    private readonly chapterService: ChapterService;
    private readonly progressService: ProgressService;
    private readonly tocService: TocService;

    /**
     * 组装读取章节和保存进度的领域服务，事务边界由本服务统一提供。
     */
    public constructor() {
        this.progressService = new ProgressService();
        this.bookService = new BookService();
        this.chapterService = new ChapterService();
        this.tocService = new TocService();
    }

    /**
     * 在同一只读事务中加载书籍、进度及其对应的目录和章节。
     * @param bookId - 书架条目的主键。
     * @returns 用于首次渲染的完整阅读状态；必需记录缺失时抛出错误。
     */
    public async init(bookId: string) {
        // 读取使用同一事务快照，避免目录和进度来自不一致的存储状态。
        return await TransactionManager.runTransaction(
            [bookStore.name, tocStore.name, chapterStore.name, progressStore.name],
            DatabaseMode.READ_ONLY,
            async (transaction) => {
                // 先确认书架条目和进度，后续读取依赖文件标识与当前章号。
                const book = assertExists(
                    await this.bookService.getByKey(bookId, transaction),
                    `Book[${bookId}] not found`
                );
                const progress = assertExists(
                    await this.progressService.getByIndex(progressStore.indexes.ukBookId.name, bookId, transaction),
                    `Progress[bookId=${bookId}] not found`
                );

                // 目录与目标章节彼此独立，可在同一事务内并行读取。
                const [toc, chapter] = await Promise.all([
                    this.tocService.getByIndex(tocStore.indexes.ukFileId.name, book.fileId, transaction),
                    this.chapterService.getByIndex(
                        chapterStore.indexes.ukFileIdChapterNumber.name,
                        [book.fileId, progress.chapterNumber],
                        transaction
                    ),
                ]);

                // 校验所有必需记录后构造状态，界面不接收半初始化的数据。
                return new ReaderState({
                    book,
                    toc: assertExists(toc, `Toc[fileId=${book.fileId}] not found`),
                    progress,
                    chapter: assertExists(
                        chapter,
                        `Chapter[fileId=${book.fileId}, chapterNumber=${String(progress.chapterNumber)}] not found`
                    ),
                });
            }
        );
    }

    /**
     * 在独立写事务中保存进度，事务失败由调用方决定提示与重试。
     * @param progress - 阅读进度对象
     */
    public async updateProgress(progress: Progress) {
        await TransactionManager.runTransaction(progressStore.name, DatabaseMode.READ_WRITE, async (transaction) => {
            await this.progressService.update(progress, transaction);
        });
    }

    /**
     * 获取指定文件的章节，记录缺失时保留文件与章号上下文。
     * @param fileId - 书籍文件标识。
     * @param chapterNumber - 章节序号，从 1 开始
     */
    public async getChapter(fileId: string, chapterNumber: number) {
        return assertExists(
            await TransactionManager.runTransaction(
                chapterStore.name,
                DatabaseMode.READ_ONLY,
                async (transaction) =>
                    await this.chapterService.getByIndex(
                        chapterStore.indexes.ukFileIdChapterNumber.name,
                        [fileId, chapterNumber],
                        transaction
                    )
            ),
            `Chapter[fileId=${fileId}, chapterNumber=${String(chapterNumber)}] not found`
        );
    }
}
