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

import AssertUtil from "../../util/assertUtil.js";

/**
 * 遮罩
 * @author allurx
 */
export default class Overlay {
    #overlay: HTMLDivElement;
    #spinner: HTMLDivElement;

    constructor({ containerElement = document.body, overlayStyle = {}, spinnerStyle = {} } = {}) {
        this.#overlay = containerElement.appendChild(this.#renderTemplate());
        this.#spinner = AssertUtil.assertExist(this.#overlay.querySelector("#spinner")) as HTMLDivElement;
        this.#applyOverlayStyle(overlayStyle);
        this.#applySpinnerStyle(spinnerStyle);
    }

    /**
     * 在执行异步处理函数时显示遮罩
     * @param handler - 异步处理函数
     */
    async showWhile(handler: () => Promise<void>) {
        try {
            await this.show();
            await handler();
        } finally {
            this.hide();
        }
    }

    /**
     * 显示遮罩
     */
    async show() {
        this.#overlay.hidden = false;
        // 确保浏览器获得一次绘制机会
        await new Promise(requestAnimationFrame);
    }

    /**
     * 隐藏遮罩
     */
    hide() {
        this.#overlay.hidden = true;
    }

    /**
     * 渲染模板
     */
    #renderTemplate(): HTMLDivElement {
        const template = document.createElement("template");
        template.innerHTML = this.#template().trim();
        return AssertUtil.assertExist(template.content.firstElementChild) as HTMLDivElement;
    }

    /**
     * 应用遮罩层样式
     * @param style - 样式对象
     */
    #applyOverlayStyle(style = {}) {
        this.#applyStyle(this.#overlay, style);
    }

    /**
     * 应用spinner样式
     * @param style - 样式对象
     */
    #applySpinnerStyle(style = {}) {
        this.#applyStyle(this.#spinner, style);
    }

    /**
     * 应用样式对象到元素
     * @param element - 目标元素
     * @param  style - 样式对象
     */
    #applyStyle(element: HTMLElement, style: Partial<CSSStyleDeclaration>) {
        for (const [key, value] of Object.entries(style)) {
            element.style.setProperty(key, value as string);
        }
    }

    /**
     * 遮罩元素的html模板
     */
    #template() {
        return `
            <div id="overlay" hidden>
                <div id="spinner"></div>
            </div>
        `;
    }
}
