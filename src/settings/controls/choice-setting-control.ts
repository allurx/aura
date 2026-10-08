/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "@/utils/event-util";
import type ChoiceSetting from "../definitions/choice-setting";
import type SettingControlListener from "./setting-control-listener";
import SettingControl from "./setting-control";

/**
 * 少量具名选项直接展开为原生单选组，具体设置可补充自己的可视预览。
 */
export default class ChoiceSettingControl extends SettingControl {
    private readonly inputByValue = new Map<string, HTMLInputElement>();

    /**
     * 可选预览由具体设置补充，应标记为装饰内容，保持选项文字作为可访问名称。
     */
    public constructor(
        private readonly choice: ChoiceSetting,
        listener: SettingControlListener,
        signal: AbortSignal,
        decorate?: (option: HTMLElement, value: string) => void
    ) {
        super(choice, listener, signal);
        this.element.classList.add("choice-setting");
        const fieldset = document.createElement("fieldset");
        fieldset.id = `setting-control-${choice.key}`;
        const legend = document.createElement("legend");
        legend.textContent = choice.title;
        const options = document.createElement("div");
        options.className = "choice-options";
        fieldset.append(legend, options);
        this.element.prepend(fieldset);

        for (const [value, title] of choice.options) {
            const option = document.createElement("label");
            option.className = "choice-option";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = `choice-${choice.key}`;
            input.value = value;
            option.append(input);
            decorate?.(option, value);

            const caption = document.createElement("span");
            caption.className = "choice-caption";
            caption.textContent = title;
            option.append(caption);
            options.append(option);
            this.inputByValue.set(value, input);

            bind(
                input,
                "change",
                () => {
                    if (input.checked) listener.commit(choice, value);
                },
                { signal }
            );
        }
    }

    public override render(value: string | undefined): void {
        const selected = this.choice.resolveValue(value);
        for (const [option, input] of this.inputByValue) input.checked = option === selected;
    }
}
