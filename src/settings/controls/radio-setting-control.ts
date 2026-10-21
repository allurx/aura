/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "@/utils/event-util";
import type Setting from "../definitions/setting";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 原生单选组共用标题、选项注册和选中同步，具体控件负责选项的图示与说明。
 */
export default abstract class RadioSettingControl extends SettingControl {
    protected readonly fieldset = document.createElement("fieldset");
    protected readonly legend = document.createElement("legend");
    protected readonly optionsElement = document.createElement("div");
    private readonly inputByValue = new Map<string, HTMLInputElement>();

    protected constructor(
        setting: Setting,
        private readonly listener: SettingControlListener,
        private readonly signal: AbortSignal,
        private readonly groupName: string
    ) {
        super(setting, listener, signal);
        this.element.classList.add("radio-setting");
        this.legend.textContent = setting.title;
        this.fieldset.append(this.legend, this.optionsElement);
        this.element.prepend(this.fieldset);
    }

    /**
     * 注册原生单选输入；调用方为返回的标签补充可访问名称、图示及专有说明。
     */
    protected createOption(value: string): { label: HTMLLabelElement; input: HTMLInputElement } {
        const label = document.createElement("label");
        label.className = "radio-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = this.groupName;
        input.value = value;
        label.append(input);
        this.optionsElement.append(label);
        this.inputByValue.set(value, input);

        bind(
            input,
            "change",
            async () => {
                if (input.checked) await this.listener.commit(this.setting, value);
            },
            { signal: this.signal }
        );
        return { label, input };
    }

    /**
     * 保留所有原生输入节点，只同步选中状态，避免刷新打断方向键导航和焦点。
     */
    public override render(value: string | undefined): void {
        const selected = this.setting.resolveValue(value);
        for (const [option, input] of this.inputByValue) input.checked = option === selected;
    }
}
