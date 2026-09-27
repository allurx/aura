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

import type ColorStyleSetting from "../definitions/color-style-setting";
import EventUtil from "@/utils/event-util";
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
        super(setting, listener, signal);

        // 挂载原生颜色输入并复用基类的可访问标签。
        this.inputElement.className = "control";
        this.inputElement.type = "color";
        this.attachControl(this.inputElement);

        // 连续选色只预览，确认值后再由 change 提交。
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

    public override render(value: string | undefined): void {
        const resolvedValue = this.toHex(this.setting.resolveValue(value));
        this.inputElement.value = resolvedValue;
        this.displayElement.textContent = resolvedValue;
    }

    /**
     * 将计算样式的 RGB 通道转换为原生颜色控件使用的六位值，不编码透明度。
     *
     * @returns RGB/RGBA 表达式对应的六位颜色；其他格式原样返回
     */
    private toHex(color: string): string {
        const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/.exec(color);
        if (!match) return color;
        const channels = match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0"));
        return `#${channels.join("")}`;
    }
}
