/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleProperty } from "../models/style-property";
import RangeStyleSetting from "./range-style-setting";

/**
 * 正文左右留白共同保存为响应式默认值的倍率，安全区仍由页面布局约束。
 */
export default class PageMarginSetting extends RangeStyleSetting {
    public constructor(element: HTMLElement) {
        super(element, StyleProperty.PAGE_MARGIN, "页边留白", [0.5, 1.5], 0.01, "");
    }

    public override formatValue(value: string): string {
        const percentage = Math.round(Number(value) * 100);
        return percentage === 100 ? "标准" : `${String(percentage)}%`;
    }
}
