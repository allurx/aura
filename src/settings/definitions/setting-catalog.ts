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

import { StyleProperty } from "../models/style-property";
import type SettingTarget from "../models/setting-target";
import { UiId } from "@/components/ui-id";
import { PageName } from "@/constants/page-name";
import ColorStyleSetting from "./color-style-setting";
import LineHeightSetting from "./line-height-setting";
import RangeStyleSetting, { type SettingRange } from "./range-style-setting";
import ThemeSetting from "./theme-setting";
import WidthSetting from "./width-setting";

/**
 * Aura 当前 Appearance 定义的共享实例目录。
 *
 * 参数不同但行为相同的 CSS 设置复用具体定义类，避免无行为差异的空壳子类。
 *
 * @author allurx
 */
export default abstract class SettingCatalog {
    public static readonly THEME = new ThemeSetting(10);
    public static readonly FONT_SIZE = new RangeStyleSetting(
        StyleProperty.FONT_SIZE,
        "字号",
        fontSizeRange,
        1,
        "px",
        20
    );
    public static readonly COLOR = new ColorStyleSetting(StyleProperty.COLOR, "文本颜色", 30);
    public static readonly BACKGROUND_COLOR = new ColorStyleSetting(StyleProperty.BACKGROUND_COLOR, "背景颜色", 40);
    public static readonly WIDTH = new WidthSetting(50);
    public static readonly PADDING_TOP = new RangeStyleSetting(
        StyleProperty.PADDING_TOP,
        "上内边距",
        verticalPaddingRange,
        1,
        "px",
        60
    );
    public static readonly PADDING_RIGHT = new RangeStyleSetting(
        StyleProperty.PADDING_RIGHT,
        "右内边距",
        horizontalPaddingRange,
        1,
        "px",
        70,
        "--ui-padding-right"
    );
    public static readonly PADDING_BOTTOM = new RangeStyleSetting(
        StyleProperty.PADDING_BOTTOM,
        "下内边距",
        verticalPaddingRange,
        1,
        "px",
        80
    );
    public static readonly PADDING_LEFT = new RangeStyleSetting(
        StyleProperty.PADDING_LEFT,
        "左内边距",
        horizontalPaddingRange,
        1,
        "px",
        90,
        "--ui-padding-left"
    );
    public static readonly LINE_HEIGHT = new LineHeightSetting(100);
}

/**
 * 正文允许较大字号；导航与操作区域保留紧凑但可读的范围。
 */
function fontSizeRange(target: SettingTarget): SettingRange {
    switch (target.ui.id) {
        case UiId.CONTENT:
            return [16, 28];
        case UiId.BOOK_LIST:
            return [14, 22];
        case UiId.SETTING:
            return [14, 20];
        case UiId.NAV:
        case UiId.FOOTER:
            return [12, 18];
        default:
            return [12, 20];
    }
}

/**
 * 首选边距按区域限定，窄屏的有效留白由响应式样式约束。
 */
function horizontalPaddingRange(target: SettingTarget): SettingRange {
    if (target.ui.id === UiId.CONTENT) return [16, 80];
    if (target.ui.id === UiId.BOOK_LIST || target.pageName === PageName.BOOKSHELF) return [12, 48];
    return [8, 32];
}

/**
 * 书目与正文留白区别于顶部、底部工具区域，不共享过宽的范围。
 */
function verticalPaddingRange(target: SettingTarget): SettingRange {
    if (target.ui.id === UiId.CONTENT) return [16, 80];
    if (target.ui.id === UiId.BOOK_LIST) return [0, 48];
    if (target.pageName === PageName.BOOKSHELF) return [8, 48];
    return [4, 24];
}
