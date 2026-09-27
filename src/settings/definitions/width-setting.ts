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
import { StyleProperty } from "../models/style-property";
import RangeStyleSetting from "./range-style-setting";

/**
 * 阅读器的首选宽度；响应式实际宽度由 CSS 约束，不反写用户首选值。
 *
 * @author allurx
 */
export default class WidthSetting extends RangeStyleSetting {
    public static readonly MIN_WIDTH_PX = 640;
    public static readonly MAX_WIDTH_PX = 960;
    public static readonly DEFAULT_WIDTH_PX = 800;
    public override readonly tracksExternalChanges = true;

    public constructor(element: HTMLElement, displayOrder: number) {
        super(
            element,
            StyleProperty.WIDTH,
            "阅读宽度",
            [WidthSetting.MIN_WIDTH_PX, WidthSetting.MAX_WIDTH_PX],
            1,
            "px",
            displayOrder
        );
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        const control = super.createControl(listener, signal);
        control.element.classList.add("width-setting");
        return control;
    }

    public override resolveValue(value: string | undefined): string {
        return value ?? this.readExternalValue() ?? `${String(WidthSetting.DEFAULT_WIDTH_PX)}px`;
    }

    /**
     * 只读取原生 resize 写入的 inline 像素宽度，不读取响应式实际尺寸。
     */
    public override readExternalValue(): string | undefined {
        const value = this.element.style.width;
        if (!value.endsWith(this.unit)) return value || undefined;
        const widthPx = Number(value.slice(0, -this.unit.length));
        if (!Number.isFinite(widthPx)) return value;
        return this.normalizeValue(widthPx);
    }
}
