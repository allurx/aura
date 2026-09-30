/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import { run } from "@/utils/event-util";
import { toggleFullscreen } from "@/utils/fullscreen-util";

/**
 * 阅读器画布与全屏生命周期。
 */
export default class AppUi extends Ui {
    /**
     * 页面退出时关闭当前阅读画布的全屏。
     */
    public cleanup(): void {
        if (document.fullscreenElement === this.root) run(() => document.exitFullscreen());
    }

    /**
     * 切换整个阅读画布的全屏状态。
     */
    public async toggleFullscreen(): Promise<void> {
        return toggleFullscreen(this.root);
    }
}
