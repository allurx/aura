/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "@/utils/event-util";
import type Setting from "../definitions/setting";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 两态设置共用原生 checkbox 开关，整行标签可点击，状态文字不重复进入可访问名称。
 */
export default class SwitchSettingControl extends SettingControl {
    private readonly input = document.createElement("input");
    private readonly state = document.createElement("span");
    private readonly onValue: string;

    public constructor(
        setting: Setting,
        listener: SettingControlListener,
        signal: AbortSignal,
        { offValue, onValue, description }: { offValue: string; onValue: string; description?: string }
    ) {
        super(setting, listener, signal);
        this.onValue = onValue;
        this.element.classList.add("switch-setting");

        // 原生输入保留键盘与表单语义，视觉状态独立于标签名称。
        const label = document.createElement("label");
        label.className = "switch-setting-label";
        label.textContent = setting.title;
        this.input.type = "checkbox";
        this.input.id = `setting-control-${setting.key}`;
        this.input.setAttribute("role", "switch");
        label.htmlFor = this.input.id;
        const control = document.createElement("label");
        control.className = "switch-setting-control";
        control.htmlFor = this.input.id;
        this.state.className = "switch-setting-state";
        this.state.setAttribute("aria-hidden", "true");
        control.append(this.state, this.input);
        this.element.prepend(label, control);

        if (description) {
            const note = document.createElement("p");
            note.className = "switch-setting-description";
            note.id = `setting-description-${setting.key}`;
            note.textContent = description;
            this.input.setAttribute("aria-describedby", note.id);
            this.element.append(note);
        }

        bind(
            this.input,
            "change",
            () => {
                listener.commit(setting, this.input.checked ? onValue : offValue);
            },
            { signal }
        );
    }

    public override render(value: string | undefined): void {
        this.input.checked = this.setting.resolveValue(value) === this.onValue;
        this.state.textContent = this.input.checked ? "开启" : "关闭";
    }
}
