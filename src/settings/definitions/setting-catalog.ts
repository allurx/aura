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
import ColorStyleSetting from "./color-style-setting";
import LineHeightSetting from "./line-height-setting";
import RangeStyleSetting from "./range-style-setting";
import type Setting from "./setting";
import ThemeSetting from "./theme-setting";
import WidthSetting from "./width-setting";

/**
 * 页面主题与阅读器必要的阅读舒适度设置。
 *
 * @author allurx
 */
export default abstract class SettingCatalog {
    public static readonly THEME = new ThemeSetting(10);

    /**
     * 将阅读常规设置直接绑定到当前阅读器和正文。
     */
    public static reader(reader: HTMLElement, content: HTMLElement): readonly Setting[] {
        return [
            this.THEME,
            new RangeStyleSetting(content, StyleProperty.FONT_SIZE, "字号", [16, 28], 1, "px", 20),
            new LineHeightSetting(content, 25),
            new RangeStyleSetting(content, StyleProperty.PARAGRAPH_SPACING, "段间距", [0, 3], 0.05, "em", 27),
            new WidthSetting(reader, 28),
            new ColorStyleSetting(content, StyleProperty.COLOR, "文字颜色", 30),
            new ColorStyleSetting(reader, StyleProperty.BACKGROUND_COLOR, "阅读背景", 40),
        ];
    }
}
