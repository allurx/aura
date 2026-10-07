/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type TocEntry from "./toc-entry";

/**
 * 同一正文共享的轻量目录，以 fileId 为主键。
 */
export default interface Toc {
    fileId: string;
    entries: TocEntry[];
}

/**
 * 从最后一个阅读单元取得全书位置总数。
 */
export function numberOfPositions(toc: Toc): number {
    return toc.entries[toc.entries.length - 1]?.endPosition ?? 0;
}
