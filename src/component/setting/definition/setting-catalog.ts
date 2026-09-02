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

import { StyleProperty } from "@/component/setting/model/style-property";
import ColorStyleSetting from "./color-style-setting";
import RangeStyleSetting from "./range-style-setting";
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
    public static readonly FONT_SIZE = new RangeStyleSetting(StyleProperty.FONT_SIZE, "字号", 12, 100, 1, "px", 20);
    public static readonly COLOR = new ColorStyleSetting(StyleProperty.COLOR, "文本颜色", 30);
    public static readonly BACKGROUND_COLOR = new ColorStyleSetting(StyleProperty.BACKGROUND_COLOR, "背景颜色", 40);
    public static readonly WIDTH = new WidthSetting(50);
    public static readonly PADDING_TOP = new RangeStyleSetting(
        StyleProperty.PADDING_TOP,
        "上内边距",
        0,
        100,
        1,
        "px",
        60
    );
    public static readonly PADDING_RIGHT = new RangeStyleSetting(
        StyleProperty.PADDING_RIGHT,
        "右内边距",
        0,
        100,
        1,
        "px",
        70
    );
    public static readonly PADDING_BOTTOM = new RangeStyleSetting(
        StyleProperty.PADDING_BOTTOM,
        "下内边距",
        0,
        100,
        1,
        "px",
        80
    );
    public static readonly PADDING_LEFT = new RangeStyleSetting(
        StyleProperty.PADDING_LEFT,
        "左内边距",
        0,
        100,
        1,
        "px",
        90
    );
    public static readonly LINE_HEIGHT = new RangeStyleSetting(StyleProperty.LINE_HEIGHT, "行高", 16, 48, 1, "px", 100);
}
