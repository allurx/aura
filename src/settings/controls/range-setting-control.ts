/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type RangeStyleSetting from "../definitions/range-style-setting";
import { bind } from "@/utils/event-util";
import StyleSettingControl from "./style-setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 有限数值范围的滑块控件。
 *
 * input 仅预览，change 才提交；刷新范围和数值时复用原生滑块节点。
 *
 */
export default class RangeSettingControl extends StyleSettingControl {
    private readonly inputElement = document.createElement("input");

    public constructor(
        private readonly rangeSetting: RangeStyleSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(rangeSetting, listener, signal);

        // 原生滑块只保存数值，CSS 单位在发送交互时补回。
        this.inputElement.className = "control";
        this.inputElement.type = "range";
        this.inputElement.step = String(rangeSetting.step);
        this.attachControl(this.inputElement);

        // 拖动与键盘调整先预览，再由原生 change 确认最终值。
        bind(
            this.inputElement,
            "input",
            (_, input) => {
                listener.preview(rangeSetting, this.withUnit(input.value));
            },
            { signal }
        );

        bind(
            this.inputElement,
            "change",
            (_, input) => {
                listener.commit(rangeSetting, this.withUnit(input.value));
            },
            { signal }
        );
    }

    public override render(value: string | undefined): void {
        const [minimum, maximum] = this.rangeSetting.range();
        const resolvedValue = this.rangeSetting.resolveValue(value);

        this.inputElement.min = String(minimum);
        this.inputElement.max = String(maximum);
        this.inputElement.value = this.withoutUnit(resolvedValue);

        const displayValue = this.rangeSetting.formatValue(resolvedValue);
        this.displayElement.textContent = displayValue;
        this.inputElement.setAttribute("aria-valuetext", displayValue);
    }

    private withUnit(value: string): string {
        return `${value}${this.rangeSetting.unit}`;
    }

    private withoutUnit(value: string): string {
        return this.rangeSetting.unit && value.endsWith(this.rangeSetting.unit)
            ? value.slice(0, -this.rangeSetting.unit.length)
            : value;
    }
}
