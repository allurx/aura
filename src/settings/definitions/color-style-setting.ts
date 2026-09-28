/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import ColorSettingControl from "../controls/color-setting-control";
import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type { StyleProperty } from "../models/style-property";
import StyleSetting from "./style-setting";

/**
 * 六位十六进制颜色设置。
 *
 */
export default class ColorStyleSetting extends StyleSetting {
    public constructor(element: HTMLElement, property: StyleProperty, title: string) {
        super(element, property, title);
    }

    public override accepts(value: unknown): value is string {
        return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new ColorSettingControl(this, listener, signal);
    }
}
