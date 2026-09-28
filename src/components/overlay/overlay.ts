/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { createElementFromHtml } from "@/utils/dom-util";

/**
 * 异步操作期间显示的处理状态与加载图形。
 */
export default class Overlay {
    private readonly root: HTMLElement;

    public constructor(container: HTMLElement) {
        this.root = container.appendChild(
            createElementFromHtml(`
            <div class="overlay" role="status" aria-live="polite" aria-atomic="true" hidden>
                <div class="spinner" aria-hidden="true"></div>
                <span class="overlay-message">正在处理，请稍候…</span>
            </div>
        `)
        );
    }

    /**
     * 让浏览器处理遮罩显示后执行操作，成功或失败均结束遮罩。
     */
    public async showWhile(handler: () => Promise<void>): Promise<void> {
        this.root.hidden = false;
        try {
            await new Promise(requestAnimationFrame);
            await handler();
        } finally {
            this.root.hidden = true;
        }
    }
}
