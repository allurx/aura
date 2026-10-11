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
 * 连续输入立即应用并保存；刷新时复用原生滑块节点，不中断拖动或键盘操作。
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

        // input 同步保存每个有效值，关闭面板或离开页面无需等待最后一次 change。
        bind(
            this.inputElement,
            "input",
            (_, input) => {
                listener.commit(rangeSetting, this.withUnit(input.value));
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

        const minimumValue = String(minimum);
        const maximumValue = String(maximum);
        const inputValue = this.withoutUnit(resolvedValue);
        if (this.inputElement.min !== minimumValue) this.inputElement.min = minimumValue;
        if (this.inputElement.max !== maximumValue) this.inputElement.max = maximumValue;
        if (this.inputElement.value !== inputValue) this.inputElement.value = inputValue;

        const displayValue = this.rangeSetting.formatValue(resolvedValue);
        if (this.displayElement.textContent !== displayValue) this.displayElement.textContent = displayValue;
        if (this.inputElement.getAttribute("aria-valuetext") !== displayValue)
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
