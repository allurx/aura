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
 * 枚举值下拉控件。
 *
 * @author allurx
 */
export default class SelectSettingControl extends SettingControl {
    private readonly selectElement = document.createElement("select");

    public constructor(
        private readonly themeSetting: ThemeSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(themeSetting, listener);
        this.selectElement.className = "control";
        for (const [value, label] of themeSetting.options) {
            const optionElement = document.createElement("option");
            optionElement.value = value;
            optionElement.textContent = label;
            this.selectElement.appendChild(optionElement);
        }
        this.attachControl(this.selectElement);

        EventUtil.bind(
            this.selectElement,
            "change",
            (_, select) => {
                listener.commit(themeSetting, select.value);
            },
            { signal }
        );
    }

    public override render(target: SettingTarget, value: string | undefined): void {
        const resolvedValue = this.themeSetting.resolveValue(target, value);
        this.selectElement.value = resolvedValue;
        this.displayElement.textContent = this.themeSetting.options.get(resolvedValue) ?? resolvedValue;
    }
}
