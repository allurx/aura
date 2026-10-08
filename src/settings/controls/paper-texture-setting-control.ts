/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "@/utils/event-util";
import type PaperTextureSetting from "../definitions/paper-texture-setting";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 用原生复选框控制正文纸纹，完整标签提供触摸目标与键盘操作。
 */
export default class PaperTextureSettingControl extends SettingControl {
    private readonly input = document.createElement("input");

    public constructor(
        private readonly paperTextureSetting: PaperTextureSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(paperTextureSetting, listener, signal);

        this.element.classList.add("paper-texture-setting");
        const label = document.createElement("label");
        label.className = "paper-texture-option";
        const title = document.createElement("span");
        title.className = "paper-texture-title";
        title.textContent = paperTextureSetting.title;
        const description = document.createElement("span");
        description.className = "paper-texture-description";
        description.id = "setting-paper-texture-description";
        description.textContent = "为正文添加细腻纸纹，保留阅读背景色。";
        this.input.type = "checkbox";
        this.input.setAttribute("aria-describedby", description.id);
        label.append(title, this.input);
        this.element.prepend(label, description);

        bind(
            this.input,
            "change",
            () => {
                listener.commit(paperTextureSetting, this.input.checked ? "fine" : "none");
            },
            { signal }
        );
    }

    public override render(value: string | undefined): void {
        this.input.checked = this.paperTextureSetting.resolveValue(value) === "fine";
    }
}
