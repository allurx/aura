/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "@/utils/event-util";
import type MaterialSetting from "../definitions/material-setting";
import type { Material } from "../definitions/material-setting";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 材质样片使用真实表面变量；原生单选组同时提供整卡点击和方向键切换。
 */
export default class MaterialSettingControl extends SettingControl {
    private readonly inputByValue = new Map<Material, HTMLInputElement>();
    private readonly description = document.createElement("p");

    public constructor(
        private readonly materialSetting: MaterialSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(materialSetting, listener, signal);

        // 材质沿用常规设置的标题和单项重置，不增加独立设置层级。
        this.element.classList.add("material-setting");
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = materialSetting.title;
        const options = document.createElement("div");
        options.className = "material-options";
        fieldset.append(legend, options);
        this.description.className = "material-current-description";
        fieldset.append(this.description);
        this.element.prepend(fieldset);

        for (const [material, { title, description }] of materialSetting.options) {
            const label = document.createElement("label");
            label.className = "material-option";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "appearance-material";
            input.value = material;

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
            label.append(input, preview, caption, explanation);
            options.append(label);
            this.inputByValue.set(material, input);

            bind(
                input,
                "change",
                () => {
                    if (input.checked) listener.commit(materialSetting, material);
                },
                { signal }
            );
        }
    }

    public override render(value: string | undefined): void {
        const material = this.materialSetting.resolveValue(value);
        for (const [option, input] of this.inputByValue) input.checked = option === material;
        this.description.textContent = this.materialSetting.options.get(material)?.description ?? "";
    }
}
