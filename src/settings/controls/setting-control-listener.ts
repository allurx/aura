/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";

/**
 * 设置控件产生的预览和提交事件。
 *
 */
export default interface SettingControlListener {
    /**
     * 连续输入只预览，直到确认或取消。
     */
    preview(setting: Setting, value: string): void;

    /**
     * 确认控件值并保存到当前页面。
     */
    commit(setting: Setting, value: string): void;

    /**
     * 移除当前项的显式覆盖，恢复页面默认值。
     */
    resetSetting(setting: Setting): void;
}
