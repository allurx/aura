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

import ColorSettingControl from "../controls/color-setting-control";
import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import { StyleProperty } from "../models/style-property";
import type SettingTarget from "../models/setting-target";
import StyleSetting from "./style-setting";

/**
 * 六位十六进制颜色设置。
 *
 * @author allurx
 */
export default class ColorStyleSetting extends StyleSetting {
    public constructor(property: StyleProperty, title: string, displayOrder: number) {
        super(property, title, displayOrder);
    }

    public override accepts(value: unknown): value is string {
        return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
    }

    /**
     * 显式文字颜色同时提供给局部配色元素；未设置时让它们使用各自的基础配色。
     */
    public override apply(target: SettingTarget, value: string | undefined): void {
        super.apply(target, value);
        if (this.property !== StyleProperty.COLOR) return;
        if (value === undefined) target.ui.root.style.removeProperty("--ui-color");
        else target.ui.root.style.setProperty("--ui-color", value);
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new ColorSettingControl(this, listener, signal);
    }
}
