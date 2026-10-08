/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleProperty } from "../models/style-property";
import RangeStyleSetting from "./range-style-setting";

/**
 * 正文行距保存为字号倍数，调整字号后保持相同的段落节奏。
 *
 */
export default class LineHeightSetting extends RangeStyleSetting {
    public constructor(element: HTMLElement) {
        super(element, StyleProperty.LINE_HEIGHT, "行距", [1.5, 2.2], 0.01, "");
    }

    /**
     * CSS 计算样式给出像素值，控件使用相对当前字号的倍数。
     */
    public override resolveValue(value: string | undefined): string {
        if (value !== undefined) return value;
        const style = window.getComputedStyle(this.element);
        return this.normalizeValue(Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize));
    }
}
