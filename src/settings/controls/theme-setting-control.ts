/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type ThemeSetting from "../definitions/theme-setting";
import RadioSettingControl from "./radio-setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 使用原生单选组切换主题，鼠标与键盘选择统一通过 change 提交。
 * 色样与页面共用主题标识和调色板，不另外维护预览颜色。
 *
 */
export default class ThemeSettingControl extends RadioSettingControl {
    public constructor(themeSetting: ThemeSetting, listener: SettingControlListener, signal: AbortSignal) {
        super(themeSetting, listener, signal, "appearance-theme");

        // 主题直接使用原生单选组，不经过常规设置的单输入外壳。
        this.element.classList.add("theme-setting");
        this.legend.className = "section-title";
        this.optionsElement.className = "theme-options";

        for (const [value, title] of themeSetting.options) {
            // 单选输入管理选中状态，外层 label 让整个色样都可点击。
            const { label } = this.createOption(value);
            label.classList.add("theme-option");

            // 紧凑色样保留表面与三册书封，直接继承真实主题的调色板。
            const swatch = document.createElement("span");
            swatch.className = "theme-swatch";
            swatch.dataset["theme"] = value;
            swatch.setAttribute("aria-hidden", "true");
            const surface = document.createElement("span");
            surface.className = "theme-preview-surface";
            for (let index = 0; index < 3; index++) {
                const cover = document.createElement("span");
                cover.className = "theme-preview-cover";
                surface.append(cover);
            }
            swatch.append(surface);

            // 标题提供单选项名称，选中标记不依赖主题缩略图内部的颜色。
            const caption = document.createElement("span");
            caption.className = "theme-caption";
            caption.textContent = title;

            label.append(swatch, caption);
        }
    }
}
