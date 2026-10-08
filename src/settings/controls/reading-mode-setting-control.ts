/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReadingMode } from "@/pages/reader/reading-mode";
import { bind } from "@/utils/event-util";
import type ReadingModeSetting from "../definitions/reading-mode-setting";
import SettingControl from "./setting-control";
import type SettingControlListener from "./setting-control-listener";

/**
 * 四种阅读方式共用原生单选组，切换后保留焦点并说明当前行为。
 */
export default class ReadingModeSettingControl extends SettingControl {
    private readonly inputByValue = new Map<ReadingMode, HTMLInputElement>();
    private readonly description = document.createElement("p");

    public constructor(
        private readonly readingModeSetting: ReadingModeSetting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        super(readingModeSetting, listener, signal);

        // 图示和整卡标签共用一个原生单选输入，方向键遵循浏览器的单选组行为。
        this.element.classList.add("reading-mode-setting");
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = readingModeSetting.title;
        const options = document.createElement("div");
        options.className = "reading-mode-options";
        this.description.className = "reading-mode-description";
        this.description.id = "reading-mode-description";
        fieldset.setAttribute("aria-describedby", this.description.id);
        fieldset.append(legend, options, this.description);
        this.element.prepend(fieldset);

        for (const [mode, { title }] of readingModeSetting.options) {
            const label = document.createElement("label");
            label.className = "reading-mode-option";
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "reading-mode";
            input.value = mode;
            const caption = document.createElement("span");
            caption.textContent = title;
            label.append(input, this.createIcon(mode), caption);
            options.append(label);
            this.inputByValue.set(mode, input);

            bind(
                input,
                "change",
                () => {
                    if (input.checked) listener.commit(readingModeSetting, mode);
                },
                { signal }
            );
        }
    }

    public override render(value: string | undefined): void {
        const mode = this.readingModeSetting.resolveValue(value);
        for (const [option, input] of this.inputByValue) input.checked = option === mode;
        this.description.textContent = this.readingModeSetting.options.get(mode)?.description ?? "";
    }

    /**
     * 图示分别表达叠页、横向移动、纵向滚动与静止页面。
     */
    private createIcon(mode: ReadingMode): SVGSVGElement {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 32 28");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "1.5");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        svg.setAttribute("aria-hidden", "true");

        const paths: Record<ReadingMode, readonly string[]> = {
            cover: ["M9 5H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12", "M12 4h14v18H12z", "M16 9h6m-6 4h6m-6 4h4"],
            slide: ["M2 5h10v17H2zM20 5h10v17H20z", "M13 13h6m-3-3 3 3-3 3"],
            scroll: ["M7 3h12v22H7z", "M10 8h6m-6 4h6m-6 4h6m-6 4h4", "M25 7v14m-3-11 3-3 3 3m-6 8 3 3 3-3"],
            none: ["M8 4h16v20H8z", "M12 10h8m-8 4h8m-8 4h5"],
        };
        for (const data of paths[mode]) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", data);
            svg.append(path);
        }
        return svg;
    }
}
