/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import ChoiceSettingControl from "../controls/choice-setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type SettingControl from "../controls/setting-control";
import Setting from "./setting";

/**
 * 有限选项共用校验与默认值，具体设置选择控件并应用所选行为。
 */
export default class ChoiceSetting extends Setting {
    public constructor(
        key: string,
        title: string,
        public readonly options: ReadonlyMap<string, string>,
        private readonly defaultValue: string,
        private readonly applyValue: (value: string) => void
    ) {
        super(key, title);
    }

    public override accepts(value: unknown): value is string {
        return typeof value === "string" && this.options.has(value);
    }

    public override resolveValue(value: string | undefined): string {
        return this.accepts(value) ? value : this.defaultValue;
    }

    public override apply(value: string | undefined): void {
        this.applyValue(this.resolveValue(value));
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new ChoiceSettingControl(this, listener, signal);
    }
}
