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

import RangeSettingControl from "../controls/range-setting-control";
import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type { StyleProperty } from "../models/style-property";
import type SettingTarget from "../models/setting-target";
import StyleSetting from "./style-setting";

/**
 * 具有有限数值区间和固定 CSS 单位的设置。
 *
 * @author allurx
 */
export default class RangeStyleSetting extends StyleSetting {
    /** @param cssVariable - 可选的 CSS 变量写入目标，交由样式设置基类处理。 */
    public constructor(
        property: StyleProperty,
        title: string,
        public readonly minimum: number,
        public readonly maximum: number,
        public readonly step: number,
        public readonly unit: string,
        displayOrder: number,
        cssVariable?: `--${string}`
    ) {
        super(property, title, displayOrder, cssVariable);
        if (minimum > maximum || step <= 0) throw new Error(`Invalid ${property} range`);
    }

    public override accepts(value: unknown): value is string {
        if (typeof value !== "string" || !value.endsWith(this.unit)) return false;
        const numericText = this.unit ? value.slice(0, -this.unit.length) : value;
        if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(numericText)) return false;
        const number = Number(numericText);
        return Number.isFinite(number) && number >= this.minimum && number <= this.maximum;
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new RangeSettingControl(this, listener, signal);
    }

    /** @returns 当前目标和值所需的 range 最大值。 */
    public controlMaximum(target: SettingTarget, value: string): number {
        void target;
        void value;
        return this.maximum;
    }
}
