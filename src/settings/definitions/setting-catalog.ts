/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleProperty } from "../models/style-property";
import ColorStyleSetting from "./color-style-setting";
import FontFamilySetting from "./font-family-setting";
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
 * 书架主题、字体和书封尺寸独立保存，尺寸调整沿用自适应网格。
 */
export function createBookshelfSettings(bookshelf: HTMLElement, bookList: HTMLElement): PageSettings {
    return {
        theme: themeSetting,
        general: [
            new FontFamilySetting(bookshelf),
            new RangeStyleSetting(bookList, StyleProperty.BOOK_COVER_WIDTH, "封面大小", [96, 200], 1, "px"),
            new RangeStyleSetting(bookList, StyleProperty.BOOK_TITLE_FONT_SIZE, "书名字号", [14, 28], 1, "px"),
        ],
    };
}

/**
 * 将阅读常规设置直接绑定到当前阅读器和正文。
 *
 */
export function createReaderSettings(reader: HTMLElement, content: HTMLElement): PageSettings {
    return {
        theme: themeSetting,
        general: [
            new FontFamilySetting(content),
            new RangeStyleSetting(content, StyleProperty.FONT_SIZE, "字号", [16, 28], 1, "px"),
            new LineHeightSetting(content),
            new RangeStyleSetting(content, StyleProperty.PARAGRAPH_SPACING, "段间距", [0, 3], 0.05, "em"),
            new WidthSetting(reader),
            new ColorStyleSetting(content, StyleProperty.COLOR, "文字颜色"),
            new ColorStyleSetting(reader, StyleProperty.BACKGROUND_COLOR, "阅读背景"),
        ],
    };
}
