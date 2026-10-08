/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import RangeSettingControl from "../controls/range-setting-control";
import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type { StyleProperty } from "../models/style-property";
import StyleSetting from "./style-setting";

/**
 * 设置的闭区间数值边界。
 */
export type SettingRange = readonly [minimum: number, maximum: number];

/**
 * 具有有限数值区间和固定 CSS 单位的设置。
 *
 */
export default class RangeStyleSetting extends StyleSetting {
    /**
     * @param bounds - 当前设置的闭区间
     * @param step - 相对于区间下界的正步长
     * @param unit - 持久化值使用的 CSS 单位；空字符串表示无单位数值
     */
    public constructor(
        element: HTMLElement,
        property: StyleProperty,
        title: string,
        private readonly bounds: SettingRange,
        public readonly step: number,
        public readonly unit: string
    ) {
        super(element, property, title);
        const [minimum, maximum] = bounds;
        if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
            throw new Error(`Invalid ${property} range`);
        }
        if (!Number.isFinite(step) || step <= 0) throw new Error(`Invalid ${property} step`);
    }

    public override accepts(value: unknown): value is string {
        // 限定单位与十进制语法，避免 Number 接受空串或其他数值形式。
        if (typeof value !== "string" || !value.endsWith(this.unit)) return false;
        const numericText = this.unit ? value.slice(0, -this.unit.length) : value;
        if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(numericText)) return false;

        // 检查边界与步长网格，并容忍浮点计算误差。
        const number = Number(numericText);
        const [minimum, maximum] = this.bounds;
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
     * 控件、输入校验和存储读取共用同一组边界。
     */
    public range(): SettingRange {
        return this.bounds;
    }

    /**
     * 默认值取当前计算样式，并与原生滑块的精度保持一致。
     */
    public override resolveValue(value: string | undefined): string {
        return value ?? this.normalizeValue(Number.parseFloat(super.resolveValue(undefined)));
    }

    /**
     * 控件与辅助技术共用可读数值；专有设置可按自身语义调整表达。
     */
    public formatValue(value: string): string {
        const numericValue = this.unit ? value.slice(0, -this.unit.length) : value;
        return this.unit === "em" || this.unit === "" ? `${numericValue} 倍` : value;
    }

    /**
     * 将计算样式或原生 resize 结果限制范围并对齐步长。
     */
    protected normalizeValue(value: number): string {
        if (!Number.isFinite(value)) throw new Error(`Cannot resolve ${this.key}`);
        const [minimum, maximum] = this.bounds;
        const bounded = Math.min(maximum, Math.max(minimum, value));
        const stepped = minimum + Math.round((bounded - minimum) / this.step) * this.step;
        return `${String(Number(stepped.toFixed(6)))}${this.unit}`;
    }
}
