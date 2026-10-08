/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleProperty } from "../models/style-property";
import RangeStyleSetting from "./range-style-setting";

/**
 * 字间距保存为相对字号的增量，默认值从自定义属性读取，不误用计算后的像素值。
 */
export default class LetterSpacingSetting extends RangeStyleSetting {
    public constructor(element: HTMLElement) {
        super(element, StyleProperty.LETTER_SPACING, "字间距", [0, 0.2], 0.001, "em");
    }

    public override formatValue(value: string): string {
        const percentage = Math.round(Number.parseFloat(value) * 1000) / 10;
        return percentage === 0 ? "标准" : `+${String(percentage)}%`;
    }
}
