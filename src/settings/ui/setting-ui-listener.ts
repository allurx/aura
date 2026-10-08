/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";
import type SettingControlListener from "../controls/setting-control-listener";

/**
 * 设置面板只读取当前显示值并发出操作，完整会话由监听器管理。
 */
export default interface SettingUiListener extends SettingControlListener {
    /**
     * @returns 当前应显示的显式值，包含尚未确认的预览。
     */
    getValue(setting: Setting): string | undefined;

    /**
     * 关闭面板前撤销未提交预览；页面销毁不调用此操作。
     */
    cancelPreviews(): void;

    /**
     * 重置页面常规设置，保留主题。
     */
    resetGeneral(): void;

    /**
     * 重置当前页面的主题和常规设置，不影响其他页面。
     */
    reset(): void;
}
