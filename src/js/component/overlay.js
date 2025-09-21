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

/**
 * 遮罩
 * @author allurx
 */
export default class Overlay {

    /** @type {HTMLElement} */
    #overlay;

    /** @type {HTMLElement} */
    #spinner;

    constructor({ containerSelector = "body", overlayStyle = {}, spinnerStyle = {} } = {}) {
        this.#overlay = document.querySelector(containerSelector).appendChild(this.#renderTemplate());
        this.#spinner = document.querySelector("#spinner");
        this.#applyOverlayStyle(overlayStyle);
        this.#applySpinnerStyle(spinnerStyle);
    }

    /** 
     * 显示遮罩
     */
    show() {
        this.#overlay.hidden = false;
    }

    /** 
     * 隐藏遮罩 
     */
    hide() {
        this.#overlay.hidden = true;
    }

    /**
     * 渲染模板
     * @return {HTMLElement} - 遮罩元素
     */
    #renderTemplate() {
        const template = document.createElement("template");
        template.innerHTML = this.#template().trim();
        return template.content.firstElementChild;
    }

    /** 
     * 模板
     * @return {string} - 遮罩元素的html模板
     */
    #template() {
        return `
            <div id="overlay" hidden>
                <div id="spinner"></div>
            </div>
        `;
    }

    /**
     * 应用遮罩层样式
     * @param {Object} style
     */
    #applyOverlayStyle(style = {}) {
        this.#applyStyle(this.#overlay, style);
    }

    /**
     * 应用spinner样式
     * @param {Object} style
     */
    #applySpinnerStyle(style = {}) {
        this.#applyStyle(this.#spinner, style);
    }

    /**
     * 应用样式对象到元素
     * @param {HTMLElement} element
     * @param {Object} style
     */
    #applyStyle(element, style) {
        for (const [key, value] of Object.entries(style)) {
            element.style[key] = value;
        }
    }
}
