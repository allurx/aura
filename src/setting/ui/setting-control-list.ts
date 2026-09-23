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

import type SettingControl from "../control/setting-control";
import type SettingControlListener from "../control/setting-control-listener";
import type Setting from "../definition/setting";
import type SettingConfiguration from "../model/setting-configuration";
import type SettingTarget from "../model/setting-target";
import { assertExists } from "@/util/assert-util";

/**
 * 设置面板共享控件的创建、筛选和渲染。
 *
 * @author allurx
 */
export default class SettingControlList {
    private readonly controlBySetting = new Map<Setting, SettingControl>();

    public constructor(
        container: HTMLElement,
        configuration: SettingConfiguration,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        [...configuration.settings]
            .sort((left, right) => left.displayOrder - right.displayOrder)
            .forEach((setting) => {
                const control = setting.createControl(listener, signal);
                this.controlBySetting.set(setting, control);
                container.appendChild(control.element);
            });
    }

    /** 显示当前目标支持的控件并渲染其已提交值。 */
    public render(
        target: SettingTarget,
        valueProvider: (target: SettingTarget, setting: Setting) => string | undefined
    ): void {
        for (const [setting, control] of this.controlBySetting) {
            if (!target.supports(setting)) {
                control.hide();
                continue;
            }
            control.render(target, valueProvider(target, setting));
            control.show();
        }
    }

    /** 渲染单个控件。 */
    public renderSetting(target: SettingTarget, setting: Setting, value: string | undefined): void {
        assertExists(this.controlBySetting.get(setting), `Missing control for setting ${setting.key}`).render(
            target,
            value
        );
    }
}
