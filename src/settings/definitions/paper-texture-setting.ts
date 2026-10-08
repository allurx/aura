/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import PaperTextureSettingControl from "../controls/paper-texture-setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type PageAppearance from "../models/page-appearance";
import Setting from "./setting";

/**
 * 正文纸纹独立于界面材质，只改变阅读表面的背景图层。
 */
export default class PaperTextureSetting extends Setting {
    public constructor(private readonly content: HTMLElement) {
        super("paperTexture", "纸面纹理");
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): PaperTextureSettingControl {
        return new PaperTextureSettingControl(this, listener, signal);
    }

    public override accepts(value: unknown): value is "none" | "fine" {
        return value === "none" || value === "fine";
    }

    public override read(appearance: PageAppearance): string | undefined {
        return appearance.getValue(this.key);
    }

    public override update(appearance: PageAppearance, value: string): PageAppearance {
        if (!this.accepts(value)) throw new Error(`Invalid paper texture: ${value}`);
        return appearance.withValue(this.key, value);
    }

    public override reset(appearance: PageAppearance): PageAppearance {
        return appearance.withoutValue(this.key);
    }

    public override apply(value: string | undefined): void {
        this.content.dataset["paperTexture"] = this.resolveValue(value);
    }

    public override resolveValue(value: string | undefined): "none" | "fine" {
        return this.accepts(value) ? value : "none";
    }
}
