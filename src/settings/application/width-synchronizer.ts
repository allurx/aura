/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type WidthSetting from "../definitions/width-setting";
import { run } from "@/utils/event-util";

/**
 * 合并原生 resize 写入的 inline 宽度；响应式实际尺寸不回写首选值。
 *
 */
export default class WidthSynchronizer {
    private timer: number | undefined;

    public constructor(private readonly width: WidthSetting) {}

    /**
     * 合并连续 inline 变化，排除已保存值、面板预览和已失效的观察结果。
     */
    public start(
        {
            getValue,
            isPreviewing,
            commit,
        }: {
            getValue: () => string | undefined;
            isPreviewing: () => boolean;
            commit: (value: string) => void;
        },
        signal: AbortSignal
    ): void {
        let observedValue = this.width.readExternalValue();

        const observer = new MutationObserver(() => {
            if (signal.aborted) return;
            const value = this.width.readExternalValue();
            if (value === observedValue) return;
            observedValue = value;
            this.cancelPending();
            if (value === undefined || !this.width.accepts(value)) return;

            this.timer = window.setTimeout(() => {
                this.timer = undefined;
                if (signal.aborted || this.width.readExternalValue() !== value) return;
                if (isPreviewing() || getValue() === value) return;

                run(() => {
                    commit(value);
                });
            }, 300);
        });

        observer.observe(this.width.element, { attributes: true, attributeFilter: ["style"] });
        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                this.cancelPending();
            },
            { once: true }
        );
    }

    /**
     * 重置或离开页面时取消尚未提交的原生宽度变化。
     */
    public cancelPending(): void {
        window.clearTimeout(this.timer);
        this.timer = undefined;
    }
}
