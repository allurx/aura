/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type ColorStyleSetting from "../definitions/color-style-setting";
import { bind } from "@/utils/event-util";
import StyleSettingControl from "./style-setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 六位十六进制颜色控件。
 *
 */
export default class ColorSettingControl extends StyleSettingControl {
    private readonly inputElement = document.createElement("input");

    public constructor(setting: ColorStyleSetting, listener: SettingControlListener, signal: AbortSignal) {
        super(setting, listener, signal);

        // 挂载原生颜色输入并复用基类的可访问标签。
        this.inputElement.className = "control";
        this.inputElement.type = "color";
        this.attachControl(this.inputElement);

        // 连续选色只预览，确认值后再由 change 提交。
        bind(
            this.inputElement,
            "input",
            (_, input) => {
                listener.preview(setting, input.value);
            },
            { signal }
        );

        bind(
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
