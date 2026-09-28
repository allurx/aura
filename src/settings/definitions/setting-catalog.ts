/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleProperty } from "../models/style-property";
import ColorStyleSetting from "./color-style-setting";
import LineHeightSetting from "./line-height-setting";
import RangeStyleSetting from "./range-style-setting";
import type { PageSettings } from "../models/setting-configuration";
import ThemeSetting from "./theme-setting";
import WidthSetting from "./width-setting";

/**
 * 两个页面共用主题定义，各自保存已提交的主题值。
 */
export const themeSetting = new ThemeSetting();

/**
 * 将阅读常规设置直接绑定到当前阅读器和正文。
 *
 */
export function createReaderSettings(reader: HTMLElement, content: HTMLElement): PageSettings {
    return {
        theme: themeSetting,
        general: [
            new RangeStyleSetting(content, StyleProperty.FONT_SIZE, "字号", [16, 28], 1, "px"),
            new LineHeightSetting(content),
            new RangeStyleSetting(content, StyleProperty.PARAGRAPH_SPACING, "段间距", [0, 3], 0.05, "em"),
            new WidthSetting(reader),
            new ColorStyleSetting(content, StyleProperty.COLOR, "文字颜色"),
            new ColorStyleSetting(reader, StyleProperty.BACKGROUND_COLOR, "阅读背景"),
        ],
    };
}
