/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type WidthSetting from "../definitions/width-setting";
import { run } from "@/utils/event-util";

/**
 * 按原生 resize 的样式变更批次保存 inline 宽度；响应式实际尺寸不回写首选值。
 *
 */
export default class WidthSynchronizer {
    private discardPending: (() => void) | undefined;

    public constructor(private readonly width: WidthSetting) {}

    /**
     * 即时提交有效原生宽度；退出前读取最后一次尚未观察的值，不丢弃已接受的写入。
     */
    public start(
        {
            getValue,
            commit,
        }: {
            getValue: () => string | undefined;
            commit: (value: string) => Promise<void>;
        },
        signal: AbortSignal
    ): void {
        let observedValue = this.width.readExternalValue();

        const submit = (): void => {
            const value = this.width.readExternalValue();
            if (value === observedValue) return;
            observedValue = value;
            if (value === undefined || !this.width.accepts(value) || getValue() === value) return;
            run(() => commit(value));
        };
        const observer = new MutationObserver(() => {
            if (!signal.aborted) submit();
        });
        this.discardPending = () => {
            observer.takeRecords();
            observedValue = this.width.readExternalValue();
        };

        observer.observe(this.width.element, { attributes: true, attributeFilter: ["style"] });
        signal.addEventListener(
            "abort",
            () => {
                submit();
                observer.disconnect();
                this.discardPending = undefined;
            },
            { once: true }
        );
    }

    /**
     * 重置前清除尚未观察的旧宽度；已提交操作按同源写入顺序先完成，再执行重置。
     */
    public cancelPending(): void {
        this.discardPending?.();
    }
}
