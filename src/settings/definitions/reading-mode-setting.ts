/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { isReadingMode, type ReadingMode } from "@/pages/reader/reading-mode";
import type PageAppearance from "../models/page-appearance";
import ReadingModeSettingControl from "../controls/reading-mode-setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import Setting from "./setting";

/**
 * 保存阅读方式，由阅读器应用行为；不将行为状态写入 CSS 属性。
 */
export default class ReadingModeSetting extends Setting {
    public readonly options: ReadonlyMap<ReadingMode, { readonly title: string; readonly description: string }> =
        new Map([
            ["cover", { title: "覆盖", description: "逐页阅读，新页覆盖当前页。" }],
            ["slide", { title: "平移", description: "逐页阅读，前后页面同时横向移动。" }],
            ["scroll", { title: "上下", description: "连续上下滚动，可以停在任意位置。" }],
            ["none", { title: "无动画", description: "逐页阅读，切换时立即显示目标页。" }],
        ]);

    public constructor(private readonly onChange: (mode: ReadingMode) => void) {
        super("readingMode", "翻页方式");
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): ReadingModeSettingControl {
        return new ReadingModeSettingControl(this, listener, signal);
    }

    public override accepts(value: unknown): value is ReadingMode {
        return isReadingMode(value);
    }

    public override read(appearance: PageAppearance): string | undefined {
        return appearance.getValue(this.key);
    }

    public override update(appearance: PageAppearance, value: string): PageAppearance {
        if (!isReadingMode(value)) throw new Error(`Invalid reading mode: ${value}`);
        return appearance.withValue(this.key, value);
    }

    public override reset(appearance: PageAppearance): PageAppearance {
        return appearance.withoutValue(this.key);
    }

    public override apply(value: string | undefined): void {
        this.onChange(this.resolveValue(value));
    }

    public override resolveValue(value: string | undefined): ReadingMode {
        return isReadingMode(value) ? value : "cover";
    }
}
