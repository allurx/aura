/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import SwitchSettingControl from "../controls/switch-setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import Setting from "./setting";

/**
 * 独立控制界面材质是否延伸到网页背景，书架与阅读器分别保存。
 */
export default class BackgroundTextureSetting extends Setting {
    public constructor() {
        super("backgroundTexture", "网页背景纹理");
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SwitchSettingControl {
        return new SwitchSettingControl(this, listener, signal, {
            offValue: "none",
            onValue: "material",
            description: "让网页背景使用当前界面材质，阅读正文保持纯色。",
        });
    }

    public override accepts(value: unknown): value is "none" | "material" {
        return value === "none" || value === "material";
    }

    public override apply(value: string | undefined): void {
        document.documentElement.dataset["backgroundTexture"] = this.resolveValue(value);
    }

    public override resolveValue(value: string | undefined): "none" | "material" {
        return this.accepts(value) ? value : "none";
    }
}
