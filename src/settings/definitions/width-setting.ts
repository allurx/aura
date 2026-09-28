/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import { StyleProperty } from "../models/style-property";
import RangeStyleSetting from "./range-style-setting";

/**
 * 阅读器的首选宽度；响应式实际宽度由 CSS 约束，不反写用户首选值。
 *
 */
export default class WidthSetting extends RangeStyleSetting {
    public static readonly MIN_WIDTH_PX = 640;
    public static readonly MAX_WIDTH_PX = 960;
    public static readonly DEFAULT_WIDTH_PX = 800;

    public constructor(element: HTMLElement) {
        super(
            element,
            StyleProperty.WIDTH,
            "阅读宽度",
            [WidthSetting.MIN_WIDTH_PX, WidthSetting.MAX_WIDTH_PX],
            1,
            "px"
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
    public readExternalValue(): string | undefined {
        const value = this.element.style.width;
        if (!value.endsWith(this.unit)) return value || undefined;
        const widthPx = Number(value.slice(0, -this.unit.length));
        if (!Number.isFinite(widthPx)) return value;
        return this.normalizeValue(widthPx);
    }
}
