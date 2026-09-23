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

import type ColorStyleSetting from "../definition/color-style-setting";
import type SettingTarget from "../model/setting-target";
import EventUtil from "@/util/event-util";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 六位十六进制颜色控件。
 *
 * @author allurx
 */
export default class ColorSettingControl extends SettingControl {
    private readonly inputElement = document.createElement("input");

    public constructor(setting: ColorStyleSetting, listener: SettingControlListener, signal: AbortSignal) {
        super(setting, listener);
        this.inputElement.className = "control";
        this.inputElement.type = "color";
        this.attachControl(this.inputElement);

        EventUtil.bind(
            this.inputElement,
            "input",
            (_, input) => {
                listener.preview(setting, input.value);
            },
            { signal }
        );
        EventUtil.bind(
            this.inputElement,
            "change",
            (_, input) => {
                listener.commit(setting, input.value);
            },
            { signal }
        );
    }

    public override render(target: SettingTarget, value: string | undefined): void {
        const resolvedValue = this.toHex(this.setting.resolveValue(target, value));
        this.inputElement.value = resolvedValue;
        this.displayElement.textContent = resolvedValue;
    }

    private toHex(color: string): string {
        const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/.exec(color);
        if (!match) return color;
        const channels = match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0"));
        return `#${channels.join("")}`;
    }
}
