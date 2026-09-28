/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */
import type Book from "@/domain/book/book";
import type Chapter from "@/domain/chapter/chapter";
import type Toc from "@/domain/toc/toc";
import type Progress from "@/domain/progress/progress";

/**
 * 阅读器状态
 */
export default interface ReaderState {
    book: Book;
    toc: Toc;
    progress: Progress;
    chapter: Chapter;
}
