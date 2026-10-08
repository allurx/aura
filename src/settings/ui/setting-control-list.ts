/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type Setting from "../definitions/setting";
import type SettingConfiguration from "../models/setting-configuration";
import { assertExists } from "@/utils/assert-util";

/**
 * 创建并刷新当前页面的主题和常规设置控件。
 *
 */
export default class SettingControlList {
    private readonly controlBySetting = new Map<Setting, SettingControl>();
    private readonly themeControl: SettingControl;

    public constructor(
        container: HTMLElement,
        themeContainer: HTMLElement,
        private readonly configuration: SettingConfiguration,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        this.themeControl = configuration.theme.createControl(listener, signal);
        themeContainer.append(this.themeControl.element);
        for (const group of configuration.generalGroups) {
            const section = document.createElement(group.collapsible ? "details" : "section");
            section.className = "setting-group";
            section.dataset["settingGroup"] = group.id;
            if (group.collapsible) {
                const heading = document.createElement("summary");
                heading.className = "setting-group-heading";
                heading.id = `setting-group-${group.id}`;
                const title = document.createElement("span");
                title.className = "setting-group-title";
                title.textContent = group.title;
                heading.append(title);
                section.append(heading);
                section.setAttribute("aria-labelledby", heading.id);
            } else section.setAttribute("aria-label", group.title);

            const items = document.createElement("div");
            items.className = "items";
            for (const setting of group.settings) {
                const control = setting.createControl(listener, signal);
                this.controlBySetting.set(setting, control);
                items.append(control.element);
            }
            section.append(items);
            container.append(section);
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
