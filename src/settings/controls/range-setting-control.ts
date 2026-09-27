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

import type RangeStyleSetting from "../definitions/range-style-setting";
import EventUtil from "@/utils/event-util";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 有限数值范围的滑块控件。
 *
 * input 仅预览，change 才提交；刷新范围和数值时复用原生滑块节点。
 *
 * @author allurx
 */
export default class RangeSettingControl extends SettingControl {
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
        EventUtil.bind(
            this.inputElement,
            "input",
            (_, input) => {
                listener.preview(rangeSetting, this.withUnit(input.value));
            },
            { signal }
        );

        EventUtil.bind(
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

        this.displayElement.textContent =
            this.rangeSetting.unit === "em" || this.rangeSetting.unit === ""
                ? `${this.withoutUnit(resolvedValue)} 倍`
                : resolvedValue;
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
