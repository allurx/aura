/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EpubResource } from "./epub";

/**
 * 同内容书籍共享原文件与阅读资源；source 的原始字节用于无损导出。
 */
type BookFile = {
    id: string;
    hash: string;
    source: Blob;
} & ({ format: "txt" } | { format: "epub"; resources: EpubResource[] });

export type { BookFile as default };
