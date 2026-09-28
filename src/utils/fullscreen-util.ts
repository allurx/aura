/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 按浏览器实际状态进入或退出全屏。
 */
export function toggleFullscreen(element: Element): Promise<void> {
    return document.fullscreenElement ? document.exitFullscreen() : element.requestFullscreen();
}
