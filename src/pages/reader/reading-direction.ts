/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 相对阅读方向，供翻页与显式章节导航共用；INVALID 表示本次输入不触发导航。
 */
export enum ReadingDirection {
    PREV = "prev",
    NEXT = "next",
    INVALID = "invalid",
}
