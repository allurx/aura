/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type MaterialSetting from "../definitions/material-setting";
import RadioSettingControl from "./radio-setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 材质样片使用真实表面变量；原生单选组同时提供整卡点击和方向键切换。
 */
export default class MaterialSettingControl extends RadioSettingControl {
    private readonly description = document.createElement("p");

    public constructor(
        private readonly materialSetting: MaterialSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(materialSetting, listener, signal, "appearance-material");

        // 材质沿用常规设置的标题和单项重置，不增加独立设置层级。
        this.element.classList.add("material-setting");
        this.optionsElement.className = "material-options";
        this.description.className = "material-current-description";
        this.fieldset.append(this.description);

        for (const [material, { title, description }] of materialSetting.options) {
            const { label, input } = this.createOption(material);
            label.className = "material-option";

            // 彩色底层供透明材质透出；样片只展示效果，不参与控件名称。
            const preview = document.createElement("span");
            preview.className = "material-preview";
            preview.setAttribute("aria-hidden", "true");
            const swatch = document.createElement("span");
            swatch.className = "material-swatch";
            swatch.dataset["material"] = material;
            preview.append(swatch);

            const caption = document.createElement("span");
            caption.className = "material-caption";
            caption.id = `material-title-${material}`;
            caption.textContent = title;
            const explanation = document.createElement("span");
            explanation.className = "material-description";
            explanation.id = `material-description-${material}`;
            explanation.textContent = description;
            input.setAttribute("aria-labelledby", caption.id);
            input.setAttribute("aria-describedby", explanation.id);
            label.append(preview, caption, explanation);
        }
    }

    public override render(value: string | undefined): void {
        super.render(value);
        const material = this.materialSetting.resolveValue(value);
        this.description.textContent = this.materialSetting.options.get(material)?.description ?? "";
    }
}
