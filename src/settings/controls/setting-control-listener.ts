/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";

/**
 * 设置控件实时保存有效输入与恢复默认值的操作。
 *
 */
export default interface SettingControlListener {
    /**
     * 立即应用有效控件值并保存到当前页面。
     */
    commit(setting: Setting, value: string): Promise<void>;

    /**
     * 移除当前项的显式覆盖，恢复页面默认值。
     */
    resetSetting(setting: Setting): Promise<void>;
}
