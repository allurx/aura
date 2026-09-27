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
import type { StyleProperty } from "../models/style-property";
import StyleSetting from "./style-setting";

/**
 * 六位十六进制颜色设置。
 *
 * @author allurx
 */
export default class ColorStyleSetting extends StyleSetting {
    public constructor(element: HTMLElement, property: StyleProperty, title: string, displayOrder: number) {
        super(element, property, title, displayOrder);
    }

    public override accepts(value: unknown): value is string {
        return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new ColorSettingControl(this, listener, signal);
    }
}
