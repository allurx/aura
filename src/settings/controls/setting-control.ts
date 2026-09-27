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

import type Setting from "../definitions/setting";
import type SettingTarget from "../models/setting-target";
import type SettingControlListener from "./setting-control-listener";

/**
 * 一个可复用于多个目标的设置控件。
 *
 * @author allurx
 */
export default abstract class SettingControl {
    public readonly element = document.createElement("div");
    protected readonly displayElement = document.createElement("span");
    protected readonly controlContainer = document.createElement("div");
    private readonly titleElement = document.createElement("label");

    protected constructor(
        public readonly setting: Setting,
        protected readonly listener: SettingControlListener
    ) {
        // 基类提供统一的设置外壳与标签，具体输入稍后关联到该标签。
        this.element.className = "item";
        this.titleElement.className = "title";
        this.titleElement.textContent = setting.title;

        // 输入与当前值分区，子类只需填充控件而不重建公共结构。
        this.controlContainer.className = "control-container";
        this.displayElement.className = "display";
        this.element.append(this.titleElement, this.controlContainer, this.displayElement);
    }

    /**
     * 根据目标与显式值刷新控件，预览期间也可显示尚未提交的值。
     *
     * @param target - 当前控件实际读写的 UI 目标
     * @param value - 预览或已提交的显式值；缺失时由设置定义解析默认表现
     */
    public abstract render(target: SettingTarget, value: string | undefined): void;

    public show(): void {
        this.element.hidden = false;
    }

    public hide(): void {
        this.element.hidden = true;
    }

    /**
     * 将具体控件与可访问标签关联后挂载。
     */
    protected attachControl(control: HTMLInputElement | HTMLSelectElement): void {
        control.id = `setting-control-${this.setting.key}`;
        this.titleElement.htmlFor = control.id;
        this.controlContainer.appendChild(control);
    }
}
