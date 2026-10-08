/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import MaterialSettingControl from "../controls/material-setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import Setting from "./setting";

/**
 * 页面表面的材质标识，与主题配色和阅读正文的显式样式独立。
 */
export type Material = "standard" | "glass" | "paper" | "ceramic" | "linen" | "wood" | "metal" | "leather" | "stone";

/**
 * 在当前页面的常规设置中保存材质，切页时同步覆盖根节点，避免沿用上一页的选择。
 */
export default class MaterialSetting extends Setting {
    public readonly options: ReadonlyMap<Material, { readonly title: string; readonly description: string }> = new Map([
        ["standard", { title: "标准", description: "清晰的纯色表面与轻柔投影。" }],
        ["wood", { title: "木纹", description: "连续纤维木理与柔和光泽。" }],
        ["glass", { title: "毛玻璃", description: "透出柔化的背景色彩，带透明边缘。" }],
        ["paper", { title: "细纹纸", description: "纤细纸纹与叠纸边缘，柔和而哑光。" }],
        ["ceramic", { title: "柔瓷", description: "柔和的釉面反光与圆润厚度感。" }],
        ["linen", { title: "亚麻", description: "经纬交错的织物纹理。" }],
        ["metal", { title: "拉丝金属", description: "顺向拉丝与清晰的金属反光。" }],
        ["leather", { title: "皮革", description: "细腻压纹与整齐缝边。" }],
        ["stone", { title: "砂岩", description: "矿物颗粒与哑光石材表面。" }],
    ]);

    public constructor(private readonly defaultMaterial: Material) {
        super("material", "界面材质");
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): MaterialSettingControl {
        return new MaterialSettingControl(this, listener, signal);
    }

    public override accepts(value: unknown): value is Material {
        return (
            value === "standard" ||
            value === "glass" ||
            value === "paper" ||
            value === "ceramic" ||
            value === "linen" ||
            value === "wood" ||
            value === "metal" ||
            value === "leather" ||
            value === "stone"
        );
    }

    public override apply(value: string | undefined): void {
        document.documentElement.dataset["material"] = this.resolveValue(value);
    }

    public override resolveValue(value: string | undefined): Material {
        return this.accepts(value) ? value : this.defaultMaterial;
    }
}
