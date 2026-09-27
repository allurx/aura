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
import RangeStyleSetting from "./range-style-setting";

/**
 * 正文行距保存为字号倍数，调整字号后仍保持相同的段落节奏。
 *
 * @author allurx
 */
export default class LineHeightSetting extends RangeStyleSetting {
    public constructor(displayOrder: number) {
        super(StyleProperty.LINE_HEIGHT, "行距", [1.5, 2.2], 0.05, "", displayOrder);
    }

    /**
     * CSS 计算样式给出像素值，控件使用相对当前字号的倍数。
     */
    public override resolveValue(target: SettingTarget, value: string | undefined): string {
        if (value !== undefined) return value;
        const style = window.getComputedStyle(target.ui.root);
        return this.normalizeValue(Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize), target);
    }
}
