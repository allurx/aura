/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type Setting from "../definitions/setting";
import type SettingConfiguration from "../models/setting-configuration";
import { assertExists } from "@/utils/assert-util";

/**
 * 创建并刷新当前页面的主题和常规设置控件。
 *
 * @author allurx
 */
export default class SettingControlList {
    private readonly controlBySetting = new Map<Setting, SettingControl>();

    public constructor(
        container: HTMLElement,
        themeContainer: HTMLElement,
        private readonly configuration: SettingConfiguration,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        for (const setting of [...configuration.settings].sort(
            (left, right) => left.displayOrder - right.displayOrder
        )) {
            const control = setting.createControl(listener, signal);
            this.controlBySetting.set(setting, control);
            const targetContainer = setting === configuration.themeSetting ? themeContainer : container;
            targetContainer.append(control.element);
        }
    }

    /**
     * 控件实例始终就位，刷新值时不移动节点，保留原生输入和焦点。
     */
    public render(valueProvider: (setting: Setting) => string | undefined): void {
        for (const setting of this.controlBySetting.keys()) this.renderSetting(setting, valueProvider(setting));
    }

    /**
     * 渲染单个控件，并同步单项重置状态。
     */
    public renderSetting(setting: Setting, value: string | undefined): void {
        const control = assertExists(this.controlBySetting.get(setting), `Missing control for setting ${setting.key}`);
        control.render(value);
        control.setCustomized(
            setting === this.configuration.themeSetting
                ? value !== this.configuration.defaultTheme
                : value !== undefined
        );
    }
}
