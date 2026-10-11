/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type ReadingModeSetting from "../definitions/reading-mode-setting";
import RadioSettingControl from "./radio-setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 四种阅读方式共用原生单选组，切换后保留焦点并说明当前行为。
 */
export default class ReadingModeSettingControl extends RadioSettingControl {
    private readonly description = document.createElement("p");

    public constructor(
        private readonly readingModeSetting: ReadingModeSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(readingModeSetting, listener, signal, "reading-mode");

        // 图示和整卡标签共用一个原生单选输入，方向键遵循浏览器的单选组行为。
        this.element.classList.add("reading-mode-setting");
        this.optionsElement.className = "reading-mode-options";
        this.description.className = "reading-mode-description";
        this.description.id = "reading-mode-description";
        this.fieldset.setAttribute("aria-describedby", this.description.id);
        this.fieldset.append(this.description);

        for (const [mode, { title }] of readingModeSetting.options) {
            const { label } = this.createOption(mode);
            label.classList.add("reading-mode-option");
            const icon = document.createElement("span");
            icon.className = `icon icon-reading-mode-${mode}`;
            icon.setAttribute("aria-hidden", "true");
            const caption = document.createElement("span");
            caption.textContent = title;
            label.append(icon, caption);
        }
    }

    public override render(value: string | undefined): void {
        super.render(value);
        const mode = this.readingModeSetting.resolveValue(value);
        this.description.textContent = this.readingModeSetting.options.get(mode)?.description ?? "";
    }
}
