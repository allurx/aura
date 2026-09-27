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
import type SettingControlListener from "./setting-control-listener";
import EventUtil from "@/utils/event-util";

/**
 * 一个页面设置控件，提供统一标签、当前值和单项重置入口。
 *
 * @author allurx
 */
export default abstract class SettingControl {
    public readonly element = document.createElement("div");
    protected readonly displayElement = document.createElement("span");
    protected readonly controlContainer = document.createElement("div");
    protected readonly resetElement = document.createElement("button");
    private readonly titleElement = document.createElement("label");

    protected constructor(
        public readonly setting: Setting,
        protected readonly listener: SettingControlListener,
        signal: AbortSignal
    ) {
        // 基类提供统一的设置外壳与标签，具体输入稍后关联到该标签。
        this.element.className = "item";
        this.titleElement.className = "title";
        this.titleElement.textContent = setting.title;

        // 输入与当前值分区，子类只需填充控件而不重建公共结构。
        this.controlContainer.className = "control-container";
        this.displayElement.className = "display";
        this.element.append(this.titleElement, this.controlContainer, this.displayElement);

        // 重置入口始终占位；默认态保留焦点，避免操作完成后焦点掉出面板。
        this.resetElement.type = "button";
        this.resetElement.className = "reset-setting icon-button";
        this.resetElement.title = `重置${setting.title}`;
        this.resetElement.setAttribute("aria-label", this.resetElement.title);
        const icon = document.createElement("span");
        icon.className = "icon icon-reset";
        icon.setAttribute("aria-hidden", "true");
        this.resetElement.append(icon);
        this.element.append(this.resetElement);
        EventUtil.bind(
            this.resetElement,
            "click",
            () => {
                if (this.resetElement.getAttribute("aria-disabled") !== "true") listener.resetSetting(setting);
            },
            { signal }
        );
    }

    /**
     * 根据显式值刷新控件，预览期间也可显示尚未提交的值。
     *
     * @param value - 预览或已提交的显式值；缺失时由设置定义解析默认表现
     */
    public abstract render(value: string | undefined): void;

    /**
     * 显式覆盖与默认值分开标记，不根据计算样式猜测是否已经修改。
     */
    public setCustomized(customized: boolean): void {
        this.element.toggleAttribute("data-customized", customized);
        this.resetElement.setAttribute("aria-disabled", String(!customized));
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
