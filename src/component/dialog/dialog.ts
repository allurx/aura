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
import AssertUtil from "../../util/assertUtil.js";

/**
 * 对话框组件
 * @author allurx
 */
export default class Dialog {
    #dialogElement: HTMLDialogElement;
    #titleElement: HTMLSpanElement;
    #bodyElement: HTMLTableSectionElement;
    #confirmBtnElement: HTMLButtonElement;
    #cancelBtnElement: HTMLButtonElement;
    #closeBtnElement: HTMLButtonElement;
    #resolve: ((ok: boolean) => void) | null = null;

    constructor({ containerElement = document.body } = {}) {
        this.#dialogElement = containerElement.appendChild(this.#renderTemplate());
        this.#titleElement = AssertUtil.assertExists(
            this.#dialogElement.querySelector<HTMLDivElement>(".dialog-title")
        );
        this.#bodyElement = AssertUtil.assertExists(
            this.#dialogElement.querySelector<HTMLTableSectionElement>(".dialog-body")
        );
        this.#confirmBtnElement = AssertUtil.assertExists(
            this.#dialogElement.querySelector<HTMLButtonElement>(".dialog-confirm-btn")
        );
        this.#cancelBtnElement = AssertUtil.assertExists(
            this.#dialogElement.querySelector<HTMLButtonElement>(".dialog-cancel-btn")
        );
        this.#closeBtnElement = AssertUtil.assertExists(
            this.#dialogElement.querySelector<HTMLButtonElement>(".dialog-close-btn")
        );
        this.#bindEvents();
    }

    /**
     * alert,只有确认按钮
     */
    async alert(content: Node | string, { title = "提示", confirmBtnText = "确定" } = {}) {
        return this.#show({ type: "alert", content, title, confirmBtnText });
    }

    /**
     * confirm,带取消按钮
     */
    async confirm(content: Node | string, { title = "确认", confirmBtnText = "确定", cancelBtnText = "取消" } = {}) {
        return this.#show({ type: "confirm", content, title, confirmBtnText, cancelBtnText });
    }

    /**
     * 显示对话框
     */
    async #show({
        type,
        content,
        title = "提示",
        confirmBtnText = "确定",
        cancelBtnText = "取消",
    }: {
        type: "alert" | "confirm";
        content: Node | string;
        title?: string;
        confirmBtnText?: string;
        cancelBtnText?: string;
    }): Promise<boolean> {
        this.#titleElement.textContent = title;
        this.#setBodyContent(content);
        this.#confirmBtnElement.textContent = confirmBtnText || "确定";

        if (type == "alert") {
            this.#cancelBtnElement.hidden = true;
        } else {
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
        EventUtil.bind(this.#dialogElement, "cancel", () => {
            this.#dialogElement.close("cancel");
        });

        // 确认按钮
        EventUtil.bind(this.#confirmBtnElement, "click", () => {
            this.#dialogElement.close("confirm");
        });

        // 取消按钮
        EventUtil.bind(this.#cancelBtnElement, "click", () => {
            this.#dialogElement.close("cancel");
        });

        // 右上角关闭按钮
        EventUtil.bind(this.#closeBtnElement, "click", () => {
            this.#dialogElement.close("cancel");
        });
    }

    /**
     * 设置正文内容
     * @param  content - 正文内容
     */
    #setBodyContent(content: Node | string) {
        if (content instanceof Node) {
            this.#bodyElement.replaceChildren(content);
        } else {
            this.#bodyElement.textContent = content;
        }
    }

    // 渲染模板
    #renderTemplate() {
        const template = document.createElement("template");
        template.innerHTML = this.#template().trim();
        return template.content.firstElementChild as HTMLDialogElement;
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
