/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";
import type SettingControlListener from "./setting-control-listener";
import { bind } from "@/utils/event-util";

/**
 * 设置控件的根节点与单项重置入口。
 *
 */
export default abstract class SettingControl {
    public readonly element = document.createElement("div");
    protected readonly resetElement = document.createElement("button");

    protected constructor(
        public readonly setting: Setting,
        listener: SettingControlListener,
        signal: AbortSignal
    ) {
        this.element.className = "item";

        // 还原与选项选择分开呈现，默认项不重复提供还原动作。
        this.resetElement.type = "button";
        this.resetElement.className = "reset-setting";
        this.resetElement.title = `重置${setting.title}`;
        this.resetElement.setAttribute("aria-label", this.resetElement.title);
        this.resetElement.textContent = "还原";
        this.element.append(this.resetElement);
        bind(
            this.resetElement,
            "click",
            () => {
                if (this.resetElement.getAttribute("aria-disabled") !== "true") listener.resetSetting(setting);
            },
            { signal }
        );
    }

    /**
     * 刷新控件的当前有效值。
     *
     * @param value - 控件应显示的值；缺失时由设置定义解析默认表现
     */
    public abstract render(value: string | undefined): void;

    /**
     * 显式覆盖与默认值分开标记，不根据计算样式猜测是否已经修改。
     */
    public setCustomized(customized: boolean): void {
        const returnFocus = !customized && document.activeElement === this.resetElement;
        if (this.element.hasAttribute("data-customized") !== customized)
            this.element.toggleAttribute("data-customized", customized);
        const disabled = String(!customized);
        if (this.resetElement.getAttribute("aria-disabled") !== disabled)
            this.resetElement.setAttribute("aria-disabled", disabled);
        const tabIndex = customized ? 0 : -1;
        if (this.resetElement.tabIndex !== tabIndex) this.resetElement.tabIndex = tabIndex;
        // 还原后把焦点交回设置本身，让按钮立即隐藏且不丢失键盘操作位置。
        if (returnFocus) {
            this.element
                .querySelector<HTMLInputElement | HTMLSelectElement>('input:checked, input:not([type="radio"]), select')
                ?.focus({ preventScroll: true });
        }
    }
}
