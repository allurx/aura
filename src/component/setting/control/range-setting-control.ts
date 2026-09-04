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

import type RangeStyleSetting from "@/component/setting/definition/range-style-setting";
import type SettingTarget from "@/component/setting/model/setting-target";
import EventUtil from "@/util/event-util";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 有限数值范围的滑块控件。
 *
 * @author allurx
 */
export default class RangeSettingControl extends SettingControl {
    private readonly inputElement = document.createElement("input");
    private target: SettingTarget | undefined;

    public constructor(
        private readonly rangeSetting: RangeStyleSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(rangeSetting, listener);
        this.inputElement.className = "control";
        this.inputElement.type = "range";
        this.inputElement.min = String(rangeSetting.minimum);
        this.inputElement.max = String(rangeSetting.maximum);
        this.inputElement.step = String(rangeSetting.step);
        this.attachControl(this.inputElement);

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
        for (const eventType of ["pointerdown", "focus"] as const) {
            EventUtil.bind(
                this.inputElement,
                eventType,
                () => {
                    this.updateMaximum();
                },
                { signal }
            );
        }
    }

    public override render(target: SettingTarget, value: string | undefined): void {
        this.target = target;
        const resolvedValue = this.rangeSetting.resolveValue(target, value);
        this.inputElement.max = String(this.rangeSetting.controlMaximum(target, resolvedValue));
        this.inputElement.value = this.withoutUnit(resolvedValue);
        this.displayElement.textContent = resolvedValue;
    }

    private updateMaximum(): void {
        if (!this.target) return;
        this.inputElement.max = String(
            this.rangeSetting.controlMaximum(this.target, this.withUnit(this.inputElement.value))
        );
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
