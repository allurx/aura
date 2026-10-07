/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */
import type Book from "@/domain/book/book";
import type Chapter from "@/domain/chapter/chapter";
import type Toc from "@/domain/toc/toc";
import type Progress from "@/domain/progress/progress";
import type BookFile from "@/domain/file/book-file";

/**
 * 当前书籍、完整目录、已提交进度与已加载章节，由阅读控制器协调更新。
 */
export default interface ReaderState {
    book: Book;
    file: BookFile;
    toc: Toc;
    progress: Progress;
    chapter: Chapter;
}
