/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPlatformFontFamily } from "../application/platform-font";
import FontSettingControl from "../controls/font-setting-control";
import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type PageAppearance from "../models/page-appearance";
import { StyleProperty } from "../models/style-property";
import StyleSetting from "./style-setting";

/**
 * 只保存用户选中的字族名称；空串是控件的默认值，提交时移除显式覆盖。
 * 字体列表不参与持久化校验，保证未授权枚举时也能同步恢复已保存的选择。
 */
export default class FontFamilySetting extends StyleSetting {
    private readonly defaultFamily: string;

    public constructor(element: HTMLElement) {
        super(element, StyleProperty.FONT_FAMILY, "字体");
        this.defaultFamily = getPlatformFontFamily(navigator);
    }

    public override accepts(value: unknown): value is string {
        return (
            typeof value === "string" &&
            value.length <= 256 &&
            value === value.trim() &&
            Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
        );
    }

    public override update(appearance: PageAppearance, value: string): PageAppearance {
        return value === "" ? appearance.withoutValue(this.property) : super.update(appearance, value);
    }

    public override apply(value: string | undefined): void {
        if (value === undefined || value === "") {
            this.element.style.fontFamily = this.defaultFamily;
            return;
        }
        if (!this.accepts(value)) throw new Error("Invalid font family name");

        // 外部字体名始终作为一个 CSS 字符串，不能变成多个字族或其他 CSS 语法。
        const family = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
        this.element.style.fontFamily = `"${family}", ${this.defaultFamily}`;
    }

    public override resolveValue(value: string | undefined): string {
        return value ?? "";
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new FontSettingControl(this, listener, signal);
    }
}
