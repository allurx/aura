/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 让出当前任务供浏览器处理输入和绘制；不支持优先续任务时使用定时器进入下一任务。
 */
export async function yieldTask(): Promise<void> {
    if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") await scheduler.yield();
    else await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
