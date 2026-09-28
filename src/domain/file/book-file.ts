/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 共享正文的来源标识；hash 用于去重，正文只保存在章节中。
 */
export default interface BookFile {
    id: string;
    hash: string;
}
