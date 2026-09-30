/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type PageAppearance from "../models/page-appearance";
import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import { StyleProperty } from "../models/style-property";
import Setting from "./setting";
import { syncBrowserTheme } from "../application/browser-theme";

/**
 * 将当前页面的常规设置映射到目标元素的 CSS 属性。
 */
export default abstract class StyleSetting extends Setting {
    /**
     * @returns 当前常规设置使用的原生输入控件。
     */
    public abstract createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl;

    protected constructor(
        public readonly element: HTMLElement,
        public readonly property: StyleProperty,
        title: string
    ) {
        super(property, title);
    }

    public override read(appearance: PageAppearance): string | undefined {
        return appearance.getStyle(this.property);
    }

    public override update(appearance: PageAppearance, value: string): PageAppearance {
        if (!this.accepts(value)) throw new Error(`Invalid ${this.key} setting value`);
        return appearance.withStyle(this.property, value);
    }

    /**
     * 从快照中移除显式值；调用 apply 后才恢复目标元素的主题或 CSS 默认样式。
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
