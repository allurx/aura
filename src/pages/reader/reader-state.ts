/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */
import type Book from "@/domain/book/book";
import type Toc from "@/domain/toc/toc";
import type Progress from "@/domain/progress/progress";
import type BookFile from "@/domain/file/book-file";

/**
 * 阅读会话的书籍、原文件、目录与已提交进度；正文窗口独立持有已加载章节。
 */
export default interface ReaderState {
    book: Book;
    file: BookFile;
    toc: Toc;
    progress: Progress;
}
