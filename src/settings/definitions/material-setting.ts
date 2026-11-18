/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import MaterialSettingControl from "../controls/material-setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import Setting from "./setting";

// 选择器和持久化校验共用这份有序清单，显示名称可独立于标识调整。
const MATERIALS = [
    { id: "standard", title: "标准", description: "清晰的纯色表面与轻柔投影。" },
    { id: "wood", title: "木纹", description: "连续纤维木理与柔和光泽。" },
    { id: "glass", title: "毛玻璃", description: "透出柔化的背景色彩，带透明边缘。" },
    { id: "paper", title: "细纹纸", description: "纤细纸纹与叠纸边缘，柔和而哑光。" },
    { id: "ceramic", title: "柔瓷", description: "柔和的釉面反光与圆润厚度感。" },
    { id: "linen", title: "亚麻", description: "经纬交错的织物纹理。" },
    { id: "metal", title: "拉丝金属", description: "顺向拉丝与清晰的金属反光。" },
    { id: "leather", title: "皮革", description: "细腻压纹与整齐缝边。" },
    { id: "stone", title: "砂岩", description: "矿物颗粒与哑光石材表面。" },
    { id: "satin", title: "丝缎", description: "斜向细丝与柔和缎光，平滑而有层次。" },
    { id: "cork", title: "软木", description: "不规则的细碎木粒，温润而哑光。" },
    { id: "carbon", title: "碳纤", description: "细密的斜向交织，低光而有清晰纹理。" },
] as const;

/**
 * 页面表面的材质标识，与主题配色和阅读正文的显式样式独立。
 */
export type Material = (typeof MATERIALS)[number]["id"];

/**
 * 在当前页面的常规设置中保存材质，切页时同步覆盖根节点，避免沿用上一页的选择。
 */
export default class MaterialSetting extends Setting {
    public readonly options = MATERIALS;

    public constructor(private readonly defaultMaterial: Material) {
        super("material", "界面材质");
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): MaterialSettingControl {
        return new MaterialSettingControl(this, listener, signal);
    }

    public override accepts(value: unknown): value is Material {
        return this.options.some(({ id }) => id === value);
    }

    public override apply(value: string | undefined): void {
        document.documentElement.dataset["material"] = this.resolveValue(value);
    }

    public override resolveValue(value: string | undefined): Material {
        return this.accepts(value) ? value : this.defaultMaterial;
    }
}
