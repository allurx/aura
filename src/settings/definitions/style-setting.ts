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
import { StyleProperty } from "../models/style-property";
import Setting from "./setting";
import { syncBrowserTheme } from "../application/browser-theme";

/**
 * 将阅读设置直接应用到对应元素的 CSS 属性。
 *
 * @author allurx
 */
export default abstract class StyleSetting extends Setting {
    protected constructor(
        public readonly element: HTMLElement,
        public readonly property: StyleProperty,
        title: string,
        displayOrder: number
    ) {
        super(property, title, displayOrder);
    }

    public override read(appearance: PageAppearance): string | undefined {
        return appearance.getStyle(this.property);
    }

    public override update(appearance: PageAppearance, value: string): PageAppearance {
        if (!this.accepts(value)) throw new Error(`Invalid ${this.key} setting value`);
        return appearance.withStyle(this.property, value);
    }

    /**
     * 移除显式样式，让阅读内容重新使用主题和 CSS 默认值。
     */
    public override reset(appearance: PageAppearance): PageAppearance {
        return appearance.withoutStyle(this.property);
    }

    public override apply(value: string | undefined): void {
        if (value === undefined) this.element.style.removeProperty(this.property);
        else this.element.style.setProperty(this.property, value);

        if (this.property === StyleProperty.BACKGROUND_COLOR) syncBrowserTheme();
    }

    public override resolveValue(value: string | undefined): string {
        return value ?? window.getComputedStyle(this.element).getPropertyValue(this.property).trim();
    }
}
