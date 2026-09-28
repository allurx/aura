/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type ThemeSetting from "../definitions/theme-setting";
import { bind } from "@/utils/event-util";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 使用原生单选组切换主题，鼠标与键盘选择统一通过 change 提交。
 * 色样与页面共用主题标识和调色板，不另外维护预览颜色。
 *
 */
export default class ThemeSettingControl extends SettingControl {
    private readonly inputByValue = new Map<string, HTMLInputElement>();
    private readonly controlContainer = document.createElement("div");

    public constructor(
        private readonly themeSetting: ThemeSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(themeSetting, listener, signal);

        // 主题直接使用原生单选组，不经过常规设置的单输入外壳。
        this.element.classList.add("theme-setting");
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.className = "section-title";
        legend.textContent = themeSetting.title;
        this.controlContainer.className = "theme-options";
        fieldset.append(legend, this.controlContainer);
        this.element.prepend(fieldset);

        for (const [value, title] of themeSetting.options) {
            // 单选输入管理选中状态，外层 label 让整个色样都可点击。
            const label = document.createElement("label");
            label.className = "theme-option";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "appearance-theme";
            input.value = value;

            // 缩略图呈现画布、表面与多种书封，直接继承真实主题的调色板。
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

            // 保留输入节点的索引，后续刷新不打断原生单选组的焦点。
            label.append(input, swatch, caption);
            this.controlContainer.append(label);
            this.inputByValue.set(value, input);

            // 鼠标点击和方向键切换共用原生 change 提交路径。
            bind(
                input,
                "change",
                () => {
                    if (input.checked) listener.commit(themeSetting, value);
                },
                { signal }
            );
        }
    }

    /**
     * 根据已提交主题同步选择标记，不重建正在操作的原生控件。
     */
    public override render(value: string | undefined): void {
        const resolvedValue = this.themeSetting.resolveValue(value);
        for (const [theme, input] of this.inputByValue) {
            const checked = theme === resolvedValue;
            input.checked = checked;

            // 恢复和重置也显示当前主题，只滚动本行，不拉动面板中的常规设置。
            if (checked) {
                const option = input.getBoundingClientRect();
                const viewport = this.controlContainer.getBoundingClientRect();
                if (option.left < viewport.left) this.controlContainer.scrollLeft += option.left - viewport.left;
                else if (option.right > viewport.right)
                    this.controlContainer.scrollLeft += option.right - viewport.right;
            }
        }
    }
}
