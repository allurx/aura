/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { readLocalFontFamilies, supportsLocalFonts } from "../application/local-fonts";
import type FontFamilySetting from "../definitions/font-family-setting";
import type SettingControlListener from "./setting-control-listener";
import StyleSettingControl from "./style-setting-control";
import { bind } from "@/utils/event-util";

/**
 * 平台默认与用户主动授权读取的本机字体选择，不自动申请权限或改变当前选择。
 */
export default class FontSettingControl extends StyleSettingControl {
    private readonly selectElement = document.createElement("select");
    private readonly selectButton = document.createElement("button");
    private readonly readOption = document.createElement("option");
    private readonly readSeparator = document.createElement("hr");
    private readonly statusElement = document.createElement("p");
    private readonly supported = supportsLocalFonts();
    private families: string[] = [];
    private value: string | undefined;
    private reading = false;
    private queried = false;
    private message = this.supported ? "" : "当前浏览器暂不支持选择本机字体。";
    private showMessage = !this.supported;

    public constructor(
        private readonly fontSetting: FontFamilySetting,
        listener: SettingControlListener,
        private readonly signal: AbortSignal
    ) {
        super(fontSetting, listener, signal);

        // 原生选框沿用设置面板的标签、预览、确认与单项重置。
        this.element.classList.add("font-setting");
        this.selectElement.className = "control";
        // 支持定制原生 select 时，让长名称在独立文本区域截断，保留箭头。
        this.selectButton.type = "button";
        this.selectButton.append(document.createElement("selectedcontent"));
        this.selectElement.append(this.selectButton, this.createOption("", "平台默认"));
        this.readOption.className = "font-read-option";
        this.readOption.textContent = "读取本机字体…";
        // 操作项用节点身份识别，不保留可能与真实字体名称冲突的特殊值。
        this.readOption.value = "";
        if (this.supported) this.selectElement.append(this.readSeparator, this.readOption);
        this.attachControl(this.selectElement);
        bind(
            this.selectElement,
            "input",
            (_, select) => {
                if (select.selectedOptions[0] !== this.readOption) listener.preview(fontSetting, select.value);
            },
            { signal }
        );
        bind(
            this.selectElement,
            "change",
            async (_, select) => {
                if (select.selectedOptions[0] === this.readOption) {
                    select.value = fontSetting.resolveValue(this.value);
                    await this.readFonts();
                    return;
                }
                listener.commit(fontSetting, select.value);
            },
            { signal }
        );

        this.statusElement.className = "font-status";
        this.statusElement.id = "setting-font-status";
        this.statusElement.setAttribute("role", "status");
        this.element.append(this.statusElement);
    }

    public override render(value: string | undefined): void {
        this.value = value;
        const selected = this.fontSetting.resolveValue(value);
        if (selected && !Array.from(this.selectElement.options).some((option) => option.value === selected)) {
            this.selectElement.insertBefore(
                this.createOption(selected, `${selected}（已保存）`),
                this.supported ? this.readSeparator : null
            );
        }
        this.selectElement.value = selected;
        this.selectElement.disabled = this.selectElement.options.length === 1;

        const unavailable = !this.showMessage && this.queried && selected && !this.families.includes(selected);
        const showMessage = Boolean(unavailable) || this.showMessage;
        this.statusElement.textContent = unavailable
            ? "列表中未找到已保存的字体，不可用时使用平台默认。"
            : this.message;
        this.statusElement.toggleAttribute("data-quiet", !showMessage);
        if (showMessage) this.selectElement.setAttribute("aria-describedby", this.statusElement.id);
        else this.selectElement.removeAttribute("aria-describedby");
    }

    /**
     * 只处理权限与平台限制；其他异常继续交给统一错误入口。
     * 异步返回后使用最近的选择，避免覆盖等待期间发生的重置或其他设置操作。
     */
    private async readFonts(): Promise<void> {
        if (this.reading) return;
        this.reading = true;
        this.readOption.disabled = true;
        this.readOption.textContent = "正在读取字体…";
        this.message = "正在读取字体，请完成浏览器的授权提示。";
        this.showMessage = true;
        this.render(this.value);

        let families: string[];
        try {
            families = await readLocalFontFamilies();
        } catch (error) {
            if (this.signal.aborted) return;
            if (!(error instanceof DOMException)) throw error;
            switch (error.name) {
                case "NotAllowedError":
                    this.message = "未获准读取本机字体，当前字体保持不变。";
                    break;
                case "SecurityError":
                case "NotSupportedError":
                    this.message = "当前页面无法读取本机字体，当前字体保持不变。";
                    break;
                case "AbortError":
                    this.message = "已取消读取，当前字体保持不变。";
                    break;
                default:
                    throw error;
            }
            this.render(this.value);
            return;
        } finally {
            if (!this.signal.aborted) {
                this.reading = false;
                this.readOption.disabled = false;
                this.readOption.textContent = this.queried ? "刷新本机字体…" : "读取本机字体…";
            }
        }
        if (this.signal.aborted) return;

        // 读取成功只更新选项，保留已保存但未列出的字体；不隐式提交任何值。
        this.families = families.filter((family) => family !== "" && this.fontSetting.accepts(family));
        this.queried = true;
        const options = document.createDocumentFragment();
        options.append(this.createOption("", "平台默认"));
        for (const family of this.families) options.append(this.createOption(family, family));
        // 操作项位于末尾，避免原生菜单的逐项方向键选择被读取操作截断。
        options.append(this.readSeparator, this.readOption);
        this.selectElement.replaceChildren(this.selectButton, options);
        this.readOption.textContent = "刷新本机字体…";
        this.message =
            this.families.length > 0 ? `已读取 ${String(this.families.length)} 款字体。` : "未读取到可选字体。";
        this.showMessage = this.families.length === 0;
        this.render(this.value);
    }

    /**
     * 字体名称只写入文本和值，不作为 HTML 或选择器使用。
     */
    private createOption(value: string, label: string): HTMLOptionElement {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
    }
}
