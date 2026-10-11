/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";
import type SettingControlListener from "../controls/setting-control-listener";

/**
 * 设置面板读取已提交值并发出保存与重置操作。
 */
export default interface SettingUiListener extends SettingControlListener {
    /**
     * @returns 当前已提交的显式值。
     */
    getValue(setting: Setting): string | undefined;

    /**
     * 重置页面常规设置，保留主题。
     */
    resetGeneral(): void;

    /**
     * 重置当前页面的主题和常规设置，不影响其他页面。
     */
    reset(): void;
}
