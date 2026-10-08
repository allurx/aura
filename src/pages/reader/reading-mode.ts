/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 上下使用连续滚动，其余方式按当前排版逐页阅读。
 */
export type ReadingMode = "cover" | "slide" | "scroll" | "none";

/**
 * 校验持久化值与外部输入，显示名称不参与模式标识。
 */
export function isReadingMode(value: unknown): value is ReadingMode {
    return value === "cover" || value === "slide" || value === "scroll" || value === "none";
}
