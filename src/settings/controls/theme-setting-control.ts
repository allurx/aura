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

import type ThemeSetting from "../definitions/theme-setting";
import type SettingTarget from "../models/setting-target";
import EventUtil from "@/utils/event-util";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 使用原生单选组切换主题，鼠标与键盘选择统一通过 change 提交。
 * 色样与页面共用主题标识和调色板，不另外维护预览颜色。
 *
 * @author allurx
 */
export default class ThemeSettingControl extends SettingControl {
    private readonly inputByValue = new Map<string, HTMLInputElement>();

    public constructor(
        private readonly themeSetting: ThemeSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(themeSetting, listener);

        // 原生分组承载统一名称，替换单值控件的通用外壳。
        this.element.classList.add("theme-setting");
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = themeSetting.title;
        this.controlContainer.className = "theme-options";
        fieldset.append(legend, this.controlContainer);
        this.element.replaceChildren(fieldset);

        for (const [value, title] of themeSetting.options) {
            // 单选输入管理选中状态，外层 label 让整个色样都可点击。
            const label = document.createElement("label");
            label.className = "theme-option";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "appearance-theme";
            input.value = value;

            // 色样只提供视觉预览，可访问名称使用相邻文本。
            const swatch = document.createElement("span");
            swatch.className = "theme-swatch";
            swatch.dataset["theme"] = value;
            swatch.setAttribute("aria-hidden", "true");
            const caption = document.createElement("span");
            caption.textContent = title;

            // 保留输入节点的索引，后续刷新不打断原生单选组的焦点。
            label.append(input, swatch, caption);
            this.controlContainer.append(label);
            this.inputByValue.set(value, input);

            // 鼠标点击和方向键切换共用原生 change 提交路径。
            EventUtil.bind(
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
    public override render(target: SettingTarget, value: string | undefined): void {
        const resolvedValue = this.themeSetting.resolveValue(target, value);
        for (const [theme, input] of this.inputByValue) input.checked = theme === resolvedValue;
    }
}
