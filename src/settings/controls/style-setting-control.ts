/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type StyleSetting from "../definitions/style-setting";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 常规设置的标签、原生输入和当前值，共用稳定节点以保留输入焦点。
 *
 */
export default abstract class StyleSettingControl extends SettingControl {
    protected readonly displayElement = document.createElement("span");
    private readonly controlContainer = document.createElement("div");
    private readonly titleElement = document.createElement("label");

    protected constructor(setting: StyleSetting, listener: SettingControlListener, signal: AbortSignal) {
        super(setting, listener, signal);
        this.titleElement.className = "title";
        this.titleElement.textContent = setting.title;
        this.controlContainer.className = "control-container";
        this.displayElement.className = "display";
        this.element.prepend(this.titleElement, this.controlContainer, this.displayElement);
    }

    /**
     * 将原生输入与可访问标签关联后挂载。
     */
    protected attachControl(control: HTMLInputElement | HTMLSelectElement): void {
        control.id = `setting-control-${this.setting.key}`;
        this.titleElement.htmlFor = control.id;
        this.controlContainer.append(control);
    }
}
