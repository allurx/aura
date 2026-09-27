/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { assertExists } from "@/utils/assert-util";

/**
 * 遮罩
 * @author allurx
 */
export default class Overlay {
    private readonly overlay: HTMLDivElement;
    private readonly spinner: HTMLDivElement;

    public constructor({
        containerElement,
        overlayStyle = {},
        spinnerStyle = {},
    }: {
        containerElement: HTMLElement;
        overlayStyle?: Partial<CSSStyleDeclaration>;
        spinnerStyle?: Partial<CSSStyleDeclaration>;
    }) {
        // 将遮罩与加载图形挂载到同一容器。
        this.overlay = containerElement.appendChild(this.renderTemplate());
        this.spinner = assertExists(this.overlay.querySelector(".spinner")) as HTMLDivElement;

        // 分别应用容器与图形的局部外观。
        this.applyOverlayStyle(overlayStyle);
        this.applySpinnerStyle(spinnerStyle);
    }

    /**
     * 在执行异步处理函数时显示遮罩
     * @param handler - 异步处理函数
     */
    public async showWhile(handler: () => Promise<void>): Promise<void> {
        try {
            await this.show();
            await handler();
        } finally {
            await this.hide();
        }
    }

    /**
     * 显示遮罩
     */
    public async show(): Promise<void> {
        this.overlay.hidden = false;
        // 确保浏览器获得一次绘制机会
        await new Promise(requestAnimationFrame);
    }

    /**
     * 隐藏遮罩
     */
    public hide(): Promise<void> {
        this.overlay.hidden = true;
        return Promise.resolve();
    }

    /**
     * 渲染模板
     */
    private renderTemplate(): HTMLDivElement {
        const template = document.createElement("template");
        template.innerHTML = this.template().trim();
        return assertExists(template.content.firstElementChild) as HTMLDivElement;
    }

    /**
     * 应用遮罩层样式
     * @param style - 样式对象
     */
    private applyOverlayStyle(style: Partial<CSSStyleDeclaration>) {
        this.applyStyle(this.overlay, style);
    }

    /**
     * 应用spinner样式
     * @param style - 样式对象
     */
    private applySpinnerStyle(style: Partial<CSSStyleDeclaration>) {
        this.applyStyle(this.spinner, style);
    }

    /**
     * 应用样式对象到元素
     * @param element - 目标元素
     * @param  style - 样式对象
     */
    private applyStyle(element: HTMLElement, style: Partial<CSSStyleDeclaration>) {
        for (const [key, value] of Object.entries(style)) {
            element.style.setProperty(key, value as string);
        }
    }

    /**
     * 遮罩元素的html模板
     */
    private template() {
        return `
            <div class="overlay" role="status" aria-live="polite" aria-atomic="true" hidden>
                <div class="spinner" aria-hidden="true"></div>
                <span class="overlay-message">正在处理，请稍候…</span>
            </div>
        `;
    }
}
