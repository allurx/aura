/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";
import type SettingControlListener from "../controls/setting-control-listener";
import type { PanelFrameBinding } from "@/components/dialog/panel-frame";
import type { PanelName } from "../models/page-appearance";

/**
 * 设置面板读取已提交值并发出保存与重置操作。
 */
export default interface SettingUiListener extends SettingControlListener {
    /**
     * 面板几何与当前页面外观共用持久化和重置边界。
     */
    getPanelFrame(name: PanelName): PanelFrameBinding;

    /**
     * 判断常规外观重置是否还需要清除浮层布局。
     */
    hasCustomLayout(): boolean;

    /**
     * @returns 当前已提交的显式值。
     */
    getValue(setting: Setting): string | undefined;

    /**
     * 重置页面常规设置，保留主题。
     */
    resetGeneral(): Promise<void>;

    /**
     * 重置当前页面的主题和常规设置，不影响其他页面。
     */
    reset(): Promise<void>;
}
