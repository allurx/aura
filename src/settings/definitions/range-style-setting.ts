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
 * 当前设置目标的闭区间数值边界。
 *
 * @author allurx
 */
export type SettingRange = readonly [minimum: number, maximum: number];

/**
 * 具有有限数值区间和固定 CSS 单位的设置。
 *
 * @author allurx
 */
export default class RangeStyleSetting extends StyleSetting {
    /**
     * @param bounds - 固定边界或按页面与 UI 目标计算的闭区间
     * @param step - 相对于区间下界的正步长
     * @param unit - 持久化值使用的 CSS 单位；空字符串表示无单位数值
     * @param cssVariable - 可选的 CSS 变量写入目标，交由样式设置基类处理。
     */
    public constructor(
        property: StyleProperty,
        title: string,
        private readonly bounds: SettingRange | ((target: SettingTarget) => SettingRange),
        public readonly step: number,
        public readonly unit: string,
        displayOrder: number,
        cssVariable?: `--${string}`
    ) {
        super(property, title, displayOrder, cssVariable);
        if (!Number.isFinite(step) || step <= 0) throw new Error(`Invalid ${property} step`);
    }

    public override accepts(value: unknown, target: SettingTarget): value is string {
        // 先校验单位和十进制形式，避免 Number 接受空串或其他数值语法。
        if (typeof value !== "string" || !value.endsWith(this.unit)) return false;
        const numericText = this.unit ? value.slice(0, -this.unit.length) : value;
        if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(numericText)) return false;

        // 值必须落在当前目标的闭区间和步长网格内，容忍浮点计算误差。
        const number = Number(numericText);
        const [minimum, maximum] = this.range(target);
        const steps = (number - minimum) / this.step;
        return (
            Number.isFinite(number) &&
            number >= minimum &&
            number <= maximum &&
            Math.abs(steps - Math.round(steps)) < 1e-7
        );
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new RangeSettingControl(this, listener, signal);
    }

    /**
     * 控件、交互和存储读取共同使用同一组目标边界。
     */
    public range(target: SettingTarget): SettingRange {
        const bounds = typeof this.bounds === "function" ? this.bounds(target) : this.bounds;
        const [minimum, maximum] = bounds;
        if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
            throw new Error(`Invalid ${this.key} range on ${target.ui.id}`);
        }
        return bounds;
    }

    /**
     * 默认值取当前计算样式，并与原生滑块的精度保持一致。
     */
    public override resolveValue(target: SettingTarget, value: string | undefined): string {
        return value ?? this.normalizeValue(Number.parseFloat(super.resolveValue(target, undefined)), target);
    }

    /**
     * 将计算样式或原生 resize 结果量化为可保存的有限值。
     *
     * @param value - 待限制范围并对齐步长的有限数值
     * @param target - 提供当前合法区间的设置目标
     * @returns 带定义单位的规范化值
     */
    protected normalizeValue(value: number, target: SettingTarget): string {
        if (!Number.isFinite(value)) throw new Error(`Cannot resolve ${this.key} on ${target.ui.id}`);
        const [minimum, maximum] = this.range(target);
        const bounded = Math.min(maximum, Math.max(minimum, value));
        const stepped = minimum + Math.round((bounded - minimum) / this.step) * this.step;
        return `${String(Number(stepped.toFixed(6)))}${this.unit}`;
    }
}
