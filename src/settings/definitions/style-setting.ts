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

import type PageAppearance from "../models/page-appearance";
import { SettingScope } from "../models/setting-scope";
import type { StyleProperty } from "../models/style-property";
import type SettingTarget from "../models/setting-target";
import Setting from "./setting";

/**
 * 投影为 UI inline CSS 样式的 Appearance 定义。
 *
 * @author allurx
 */
export default abstract class StyleSetting extends Setting {
    /**
     * @param cssVariable - 可选的 CSS 变量写入目标；设置键与计算样式读取仍使用 property。
     */
    protected constructor(
        public readonly property: StyleProperty,
        title: string,
        displayOrder: number,
        private readonly cssVariable?: `--${string}`
    ) {
        super(property, title, SettingScope.UI, displayOrder);
    }

    public override read(appearance: PageAppearance, target: SettingTarget): string | undefined {
        return appearance.getStyle(target.ui.id, this.property);
    }

    public override update(appearance: PageAppearance, target: SettingTarget, value: string): PageAppearance {
        if (!this.accepts(value)) throw new Error(`Invalid ${this.key} setting value`);
        return appearance.withStyle(target.ui.id, this.property, value);
    }

    /** 向定义声明的 CSS 目标写入样式，未指定变量时使用原生属性。 */
    public override apply(target: SettingTarget, value: string | undefined): void {
        const property = this.cssVariable ?? this.property;
        if (value === undefined) target.ui.root.style.removeProperty(property);
        else target.ui.root.style.setProperty(property, value);
    }

    public override resolveValue(target: SettingTarget, value: string | undefined): string {
        return value ?? window.getComputedStyle(target.ui.root).getPropertyValue(this.property).trim();
    }
}
