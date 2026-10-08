/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleProperty } from "../models/style-property";
import { Theme } from "../models/theme";
import ColorStyleSetting from "./color-style-setting";
import FontFamilySetting from "./font-family-setting";
import LineHeightSetting from "./line-height-setting";
import RangeStyleSetting from "./range-style-setting";
import type { PageSettings } from "../models/setting-configuration";
import ThemeSetting from "./theme-setting";
import WidthSetting from "./width-setting";
import ReadingModeSetting from "./reading-mode-setting";
import type { ReadingMode } from "@/pages/reader/reading-mode";
import MaterialSetting from "./material-setting";
import BackgroundTextureSetting from "./background-texture-setting";
import PageMarginSetting from "./page-margin-setting";
import LetterSpacingSetting from "./letter-spacing-setting";
import BookCoverStyleSetting from "./book-cover-style-setting";
import BookCoverColorSetting from "./book-cover-color-setting";

/**
 * 两个页面共用主题定义，各自保存已提交的主题值。
 */
export const themeSetting = new ThemeSetting();

/**
 * 将书架字体绑定到页面，封面大小与书名字号绑定到书目列表。
 */
export function createBookshelfSettings(bookshelf: HTMLElement, bookList: HTMLElement): PageSettings {
    return {
        theme: themeSetting,
        defaultTheme: Theme.SUNNY,
        generalGroups: [
            {
                id: "bookshelf-display",
                title: "书架显示",
                collapsible: false,
                settings: [
                    new FontFamilySetting(bookshelf),
                    new RangeStyleSetting(bookList, StyleProperty.BOOK_COVER_WIDTH, "封面大小", [96, 200], 1, "px"),
                    new RangeStyleSetting(
                        bookList,
                        StyleProperty.BOOK_TITLE_FONT_SIZE,
                        "书名字号",
                        [14, 28],
                        0.1,
                        "px"
                    ),
                ],
            },
            {
                id: "bookshelf-surfaces",
                title: "封面与材质",
                collapsible: true,
                settings: [
                    new BookCoverStyleSetting(bookList),
                    new BookCoverColorSetting(bookList),
                    new MaterialSetting("wood"),
                    new BackgroundTextureSetting(),
                ],
            },
        ],
    };
}

/**
 * 将阅读常规设置绑定到阅读器或正文，避免修改工具栏与浮层的排版。
 */
export function createReaderSettings(
    reader: HTMLElement,
    content: HTMLElement,
    onReadingModeChange: (mode: ReadingMode) => void
): PageSettings {
    return {
        theme: themeSetting,
        defaultTheme: Theme.PAPER,
        generalGroups: [
            {
                id: "reading-basics",
                title: "常用阅读",
                collapsible: false,
                settings: [
                    new ReadingModeSetting(onReadingModeChange),
                    new FontFamilySetting(content),
                    new RangeStyleSetting(content, StyleProperty.FONT_SIZE, "字号", [16, 28], 0.1, "px"),
                    new LineHeightSetting(content),
                    new PageMarginSetting(content),
                ],
            },
            {
                id: "reading-typesetting",
                title: "排版细调",
                collapsible: true,
                settings: [
                    new LetterSpacingSetting(content),
                    new RangeStyleSetting(content, StyleProperty.PARAGRAPH_SPACING, "段间距", [0, 3], 0.01, "em"),
                    new WidthSetting(reader),
                ],
            },
            {
                id: "reading-surfaces",
                title: "配色与材质",
                collapsible: true,
                settings: [
                    new ColorStyleSetting(content, StyleProperty.COLOR, "文字颜色"),
                    new ColorStyleSetting(reader, StyleProperty.BACKGROUND_COLOR, "阅读背景"),
                    new MaterialSetting("standard"),
                    new BackgroundTextureSetting(),
                ],
            },
        ],
    };
}
