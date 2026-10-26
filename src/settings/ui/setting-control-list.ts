/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type Setting from "../definitions/setting";
import type SettingConfiguration from "../models/setting-configuration";
import ColorStyleSetting from "../definitions/color-style-setting";
import StyleSetting from "../definitions/style-setting";

/**
 * 创建并刷新当前页面的主题和常规设置控件。
 *
 */
export default class SettingControlList {
    private readonly controlBySetting = new Map<Setting, SettingControl>();
    private readonly resolvedValues = new Map<Setting, { resolved: string; customized: boolean }>();

    public constructor(
        container: HTMLElement,
        themeContainer: HTMLElement,
        private readonly configuration: SettingConfiguration,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        const themeControl = configuration.theme.createControl(listener, signal);
        themeContainer.append(themeControl.element);
        this.controlBySetting.set(configuration.theme, themeControl);
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
            if (group.collapsible) {
                // 无内边距的外层承担收展裁切，控件网格保留自己的间距与原生交互。
                const content = document.createElement("div");
                content.className = "disclosure-content";
                content.append(items);
                section.append(content);
            } else section.append(items);
            container.append(section);
        }
    }

    /**
     * 控件实例始终就位，刷新值时不移动节点，保留原生输入和焦点。
     */
    public render(
        valueProvider: (setting: Setting) => string | undefined,
        changed?: readonly Setting[],
        deferDefaultStyles = false
    ): Setting[] {
        const themeChanged = changed?.includes(this.configuration.theme);
        const values = [];
        const deferred: Setting[] = [];
        for (const [setting, control] of this.controlBySetting) {
            const value = valueProvider(setting);
            // 当前默认排版使用固定字号、倍率与页面变量，单项调整不改变其他控件的值。
            // 主题会改变未显式覆盖的颜色；视口变化与打开面板仍完整读取响应式默认值。
            if (
                changed &&
                !changed.includes(setting) &&
                !(themeChanged && value === undefined && setting instanceof ColorStyleSetting)
            )
                continue;
            if (deferDefaultStyles && value === undefined && setting instanceof StyleSetting) {
                deferred.push(setting);
                continue;
            }
            values.push({
                setting,
                control,
                resolved: setting.resolveValue(value),
                customized:
                    setting === this.configuration.theme
                        ? value !== this.configuration.defaultTheme
                        : value !== undefined,
            });
        }

        // 先完成全部默认值的样式读取，再更新输入，避免读写交替触发布局。
        for (const { setting, control, resolved, customized } of values) {
            const previous = this.resolvedValues.get(setting);
            // 环境刷新只写变化值；交互后的原生输入可能已先改变，提交或回滚仍强制同步。
            if (changed === undefined && previous?.resolved === resolved && previous.customized === customized)
                continue;
            control.render(resolved);
            control.setCustomized(customized);
            this.resolvedValues.set(setting, { resolved, customized });
        }
        return deferred;
    }

    /**
     * 重开时恢复最近保存的控件值；复用已解析的页面值，不为打开面板重新测量样式。
     */
    public restoreValues(): void {
        for (const [setting, control] of this.controlBySetting) {
            const value = this.resolvedValues.get(setting);
            if (!value) continue;
            control.render(value.resolved);
            control.setCustomized(value.customized);
        }
    }
}
