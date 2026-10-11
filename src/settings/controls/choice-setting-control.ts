/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type ChoiceSetting from "../definitions/choice-setting";
import type SettingControlListener from "./setting-control-listener";
import RadioSettingControl from "./radio-setting-control";

/**
 * 少量具名选项直接展开为原生单选组，具体设置可补充自己的可视预览。
 */
export default class ChoiceSettingControl extends RadioSettingControl {
    /**
     * 可选预览由具体设置补充，应标记为装饰内容，保持选项文字作为可访问名称。
     */
    public constructor(
        choice: ChoiceSetting,
        listener: SettingControlListener,
        signal: AbortSignal,
        decorate?: (option: HTMLElement, value: string) => void
    ) {
        super(choice, listener, signal, `choice-${choice.key}`);
        this.element.classList.add("choice-setting");
        this.fieldset.id = `setting-control-${choice.key}`;
        this.optionsElement.className = "choice-options";

        for (const [value, title] of choice.options) {
            const { label: option } = this.createOption(value);
            option.classList.add("choice-option");
            decorate?.(option, value);

            const caption = document.createElement("span");
            caption.className = "choice-caption";
            caption.textContent = title;
            option.append(caption);
        }
    }
}
