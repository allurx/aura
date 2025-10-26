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

import EventUtil from "../../util/eventUtil.js";

/**
 * 对话框组件
 * @author allurx
 */
export default class Dialog {

    /** @type {HTMLDialogElement} */
    #dialogElement;

    /** @type {HTMLElement} */
    #titleElement;

    /** @type {HTMLElement} */
    #bodyElement;

    /** @type {HTMLButtonElement} */
    #confirmBtnElement;

    /** @type {HTMLButtonElement} */
    #cancelBtnElement;

    /** @type {HTMLButtonElement} */
    #closeBtnElement;

    /** @type {(ok: boolean) => void | null} */
    #resolve = null;

    constructor({ containerElement = document.body } = {}) {
        this.#dialogElement = containerElement.appendChild(this.#renderTemplate());
        this.#titleElement = this.#dialogElement.querySelector(".dialog-title");
        this.#bodyElement = this.#dialogElement.querySelector(".dialog-body");
        this.#confirmBtnElement = this.#dialogElement.querySelector(".dialog-confirm-btn");
        this.#cancelBtnElement = this.#dialogElement.querySelector(".dialog-cancel-btn");
        this.#closeBtnElement = this.#dialogElement.querySelector(".dialog-close-btn");
        this.#bindEvents();
    }

    /**
     * alert,只有确认按钮
     * @param {Node | string} content 正文内容
     * @param {Object} options 选项
     * @param {string} [options.title] 标题
     * @param {string} [options.confirmBtnText] 确认按钮文本
     * @return {Promise<boolean>} 用户是否确认
     */
    async alert(content, { title = "提示", confirmBtnText = "确定" } = {}) {
        return this.#show({ type: "alert", content, title, confirmBtnText });
    }

    /**
     * confirm,带取消按钮
     * @param {Node | string} content 正文内容
     * @param {Object} options 选项
     * @param {string} [options.title] 标题
     * @param {string} [options.confirmBtnText] 确认按钮文本
     * @param {string} [options.cancelBtnText] 取消按钮文本
     * @return {Promise<boolean>} 用户是否确认
     */
    async confirm(content, { title = "确认", confirmBtnText = "确定", cancelBtnText = "取消" } = {}) {
        return this.#show({ type: "confirm", content, title, confirmBtnText, cancelBtnText });
    }

    /**
     * 显示对话框
     * @param {Object} options 选项
     * @param {"alert" | "confirm"} options.type 类型
     * @param {Node | string} options.content 正文内容
     * @param {string} [options.title] 标题
     * @param {string} [options.confirmBtnText] 确认按钮文本
     * @param {string} [options.cancelBtnText] 取消按钮文本
     * @return {Promise<boolean>} 用户是否确认
     */
    async #show({ type, content, title = "提示", confirmBtnText = "确定", cancelBtnText = "取消" } = {}) {

        this.#titleElement.textContent = title ?? "";
        this.#setBodyContent(content);
        this.#confirmBtnElement.textContent = confirmBtnText ?? "确定";

        if (type == "alert") {
            this.#cancelBtnElement.hidden = true;
        } else if (type == "confirm") {
            this.#cancelBtnElement.hidden = false;
            this.#cancelBtnElement.textContent = cancelBtnText;
        }

        return new Promise((resolve) => {
            this.#resolve = resolve;
            this.#dialogElement.showModal();
            // 移除dialog打开时的第一个可聚焦的后代元素的焦点
            this.#closeBtnElement.blur();
        });
    }

    // 事件绑定
    #bindEvents() {

        // 统一在close事件中resolve
        EventUtil.bind(this.#dialogElement, "close", () => {
            const ok = this.#dialogElement.returnValue === "confirm";
            const resolve = this.#resolve;
            this.#resolve = null;
            // 清理,防止下次误判
            this.#dialogElement.returnValue = "";
            resolve?.(ok);
        });

        // 处理cancel事件
        EventUtil.bind(this.#dialogElement, "cancel", (event, targetElement) => {
            this.#dialogElement.close("cancel");
        });

        // 确认按钮
        EventUtil.bind(this.#confirmBtnElement, "click", () => this.#dialogElement.close("confirm"));

        // 取消按钮
        EventUtil.bind(this.#cancelBtnElement, "click", () => this.#dialogElement.close("cancel"));

        // 右上角关闭按钮
        EventUtil.bind(this.#closeBtnElement, "click", () => this.#dialogElement.close("cancel"));
    }

    /**
     * 设置正文内容
     * @param {Node | string} content
     */
    #setBodyContent(content) {
        if (content instanceof Node) {
            this.#bodyElement.replaceChildren(content);
        } else {
            this.#bodyElement.textContent = content ?? "";
        }
    }

    // 私有：模板与渲染
    #renderTemplate() {
        const template = document.createElement("template");
        template.innerHTML = this.#template().trim();
        return template.content.firstElementChild;
    }

    #template() {
        return `
      <dialog class="dialog">
        <div class="dialog-wrapper">
          <header class="dialog-header">
            <span class="dialog-title"></span>
            <button class="dialog-close-btn" title="关闭">✖</button>
          </header>
          <section class="dialog-body"></section>
          <footer class="dialog-footer">
            <button type="button" class="dialog-cancel-btn">取消</button>
            <button type="button" class="dialog-confirm-btn">确定</button>
          </footer>
        </div>
      </dialog>
    `;
    }

}