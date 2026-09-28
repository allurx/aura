/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type Setting from "../definitions/setting";
import ThemeSettingControl from "../controls/theme-setting-control";
import type SettingConfiguration from "../models/setting-configuration";
import { assertExists } from "@/utils/assert-util";

/**
 * 创建并刷新当前页面的主题和常规设置控件。
 *
 */
export default class SettingControlList {
    private readonly controlBySetting = new Map<Setting, SettingControl>();
    private readonly themeControl: ThemeSettingControl;

    public constructor(
        container: HTMLElement,
        themeContainer: HTMLElement,
        private readonly configuration: SettingConfiguration,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        this.themeControl = new ThemeSettingControl(configuration.theme, listener, signal);
        themeContainer.append(this.themeControl.element);
        for (const setting of configuration.general) {
            const control = setting.createControl(listener, signal);
            this.controlBySetting.set(setting, control);
            container.append(control.element);
        }
    }

    /**
     * 控件实例始终就位，刷新值时不移动节点，保留原生输入和焦点。
     */
    public render(valueProvider: (setting: Setting) => string | undefined): void {
        const theme = valueProvider(this.configuration.theme);
        this.themeControl.render(theme);
        this.themeControl.setCustomized(theme !== this.configuration.defaultTheme);
        for (const setting of this.controlBySetting.keys()) this.renderSetting(setting, valueProvider(setting));
    }

    /**
     * 渲染单个控件，并同步单项重置状态。
     */
    public renderSetting(setting: Setting, value: string | undefined): void {
        const control = assertExists(this.controlBySetting.get(setting), `Missing control for setting ${setting.key}`);
        control.render(value);
        control.setCustomized(value !== undefined);
    }
}
