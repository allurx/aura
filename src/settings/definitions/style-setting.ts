/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleProperty } from "../models/style-property";
import Setting from "./setting";
import { syncBrowserTheme } from "../application/browser-theme";

/**
 * 将当前页面的常规设置映射到目标元素的 CSS 属性。
 */
export default abstract class StyleSetting extends Setting {
    protected constructor(
        public readonly element: HTMLElement,
        public readonly property: StyleProperty,
        title: string
    ) {
        super(property, title);
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
