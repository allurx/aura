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

import Setting from "@/component/setting/definition/setting";
import SettingTarget from "@/component/setting/model/setting-target";
import SettingControlListener from "./setting-control-listener";

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
        this.element.className = "item";

        this.titleElement.className = "title";
        this.titleElement.textContent = setting.title;

        this.controlContainer.className = "control-container";
        this.displayElement.className = "display";
        this.element.append(this.titleElement, this.controlContainer, this.displayElement);
    }

    /** 根据目标及已提交显式值刷新控件。 */
    public abstract render(target: SettingTarget, value: string | undefined): void;

    public show(): void {
        this.element.hidden = false;
    }

    public hide(): void {
        this.element.hidden = true;
    }

    /** 将具体控件与可访问标签关联后挂载。 */
    protected attachControl(control: HTMLInputElement | HTMLSelectElement): void {
        control.id = `setting-control-${this.setting.key}`;
        this.titleElement.htmlFor = control.id;
        this.controlContainer.appendChild(control);
    }
}
