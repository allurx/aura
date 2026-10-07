/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { createElementFromHtml } from "@/utils/dom-util";
import { assertExists } from "@/utils/assert-util";

/**
 * 异步操作期间显示的处理状态与加载图形；调用方保证同一实例的操作不重叠。
 */
export default class Overlay {
    private readonly root: HTMLElement;
    private readonly messageElement: HTMLElement;

    public constructor(container: HTMLElement) {
        this.root = container.appendChild(
            createElementFromHtml(`
            <div class="overlay" role="status" aria-live="polite" aria-atomic="true" hidden>
                <div class="spinner" aria-hidden="true"></div>
                <span class="overlay-message">正在处理，请稍候…</span>
            </div>
        `)
        );
        this.messageElement = assertExists(this.root.querySelector<HTMLElement>(".overlay-message"));
    }

    /**
     * 显示遮罩并等待一次动画帧回调后执行操作，成功或失败均隐藏并恢复原提示。
     * @param handler - 操作期间可通过 setStatus 更新进度；退出页面后不再更新显示。
     * @param message - 本次操作的初始提示；省略时沿用组件默认提示。
     */
    public async showWhile(
        handler: (setStatus: (message: string) => void) => Promise<void>,
        message?: string
    ): Promise<void> {
        const previousMessage = this.messageElement.textContent;
        if (message !== undefined) this.messageElement.textContent = message;
        this.root.hidden = false;

        try {
            await new Promise(requestAnimationFrame);
            await handler((message) => {
                if (this.root.isConnected) this.messageElement.textContent = message;
            });
        } finally {
            this.root.hidden = true;
            this.messageElement.textContent = previousMessage;
        }
    }
}
