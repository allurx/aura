/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";

/**
 * 保存尚未确认的 input 值，并屏蔽取消之后迟到的 change 事件。
 *
 */
export default class SettingPreviewSession {
    private readonly values = new Map<Setting, string>();
    private readonly cancelledSettings = new Set<Setting>();

    /**
     * 新的 input 重新开启预览，并解除上一轮取消留下的提交标记。
     */
    public begin(setting: Setting, value: string): void {
        this.cancelledSettings.delete(setting);
        this.values.set(setting, value);
    }

    /**
     * @returns 当前预览值；没有预览时返回 undefined。
     */
    public getValue(setting: Setting): string | undefined {
        return this.values.get(setting);
    }

    /**
     * 结束该项的预览会话。
     */
    public finish(setting: Setting): void {
        this.values.delete(setting);
    }

    /**
     * @returns 当前提交是否来自已取消且尚未开始下一次 input 的预览。
     */
    public isCancelled(setting: Setting): boolean {
        return this.cancelledSettings.has(setting);
    }

    /**
     * @returns 指定设置是否仍有尚未确认的预览。
     */
    public isPreviewing(setting: Setting): boolean {
        return this.values.has(setting);
    }

    /**
     * 取消全部预览；逐项恢复，单项失败不能阻止其他设置和会话的清理。
     */
    public cancel(restore: (setting: Setting) => void): void {
        const errors: unknown[] = [];
        for (const setting of this.values.keys()) {
            this.cancelledSettings.add(setting);
            try {
                restore(setting);
            } catch (error) {
                errors.push(error);
            }
        }
        this.values.clear();
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, "Failed to restore settings previews");
    }

    /**
     * 页面销毁时丢弃会话，不再向即将移除的 DOM 写回。
     */
    public discard(): void {
        this.values.clear();
        this.cancelledSettings.clear();
    }
}
