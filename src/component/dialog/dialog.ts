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

import EventUtil from "@/util/event-util";
import { assertExists } from "@/util/assert-util";

type DialogRequest =
    | {
          type: "alert";
          content: Node | string;
          title: string;
          confirmBtnText: string;
      }
    | {
          type: "confirm";
          content: Node | string;
          title: string;
          confirmBtnText: string;
          cancelBtnText: string;
      };

/**
 * 对话框组件
 * @author allurx
 */
export default class Dialog {
    private readonly dialogElement: HTMLDialogElement;
    private readonly titleElement: HTMLSpanElement;
    private readonly closeBtnElement: HTMLSpanElement;
    private readonly bodyElement: HTMLElement;
    private readonly cancelBtnElement: HTMLButtonElement;
    private readonly confirmBtnElement: HTMLButtonElement;
    private resolve: ((ok: boolean) => void) | null = null;

    public constructor({ containerElement }: { containerElement: HTMLElement }) {
        this.dialogElement = containerElement.appendChild(this.renderTemplate());
        this.titleElement = assertExists(this.dialogElement.querySelector<HTMLDivElement>(".title"));
        this.closeBtnElement = assertExists(this.dialogElement.querySelector<HTMLSpanElement>(".close-btn"));
        this.bodyElement = assertExists(this.dialogElement.querySelector<HTMLElement>(".body"));
        this.cancelBtnElement = assertExists(this.dialogElement.querySelector<HTMLButtonElement>(".cancel-btn"));
        this.confirmBtnElement = assertExists(this.dialogElement.querySelector<HTMLButtonElement>(".confirm-btn"));
        this.bindEvents();
    }

    /**
     * alert,只有确认按钮
     */
    public async alert(content: Node | string, { title = "提示", confirmBtnText = "确定" } = {}) {
        return this.show({ type: "alert", content, title, confirmBtnText });
    }

    /**
     * confirm,带取消按钮
     */
    public async confirm(
        content: Node | string,
        { title = "确认", confirmBtnText = "确定", cancelBtnText = "取消" } = {}
    ) {
        return this.show({ type: "confirm", content, title, confirmBtnText, cancelBtnText });
    }

    /**
     * 显示对话框
     */
    private async show(request: DialogRequest): Promise<boolean> {
        this.titleElement.textContent = request.title;
        this.setBodyContent(request.content);
        this.confirmBtnElement.textContent = request.confirmBtnText;

        if (request.type === "alert") {
            this.cancelBtnElement.hidden = true;
        } else {
            this.cancelBtnElement.hidden = false;
            this.cancelBtnElement.textContent = request.cancelBtnText;
        }

        return new Promise((resolve) => {
            this.resolve = resolve;
            this.dialogElement.showModal();
            // 移除dialog打开时的第一个可聚焦的后代元素的焦点
            this.cancelBtnElement.blur();
            this.confirmBtnElement.blur();
        });
    }

    // 事件绑定
    private bindEvents() {
        // 统一在close事件中resolve
        EventUtil.bind(this.dialogElement, "close", () => {
            const ok = this.dialogElement.returnValue === "confirm";
            const resolve = this.resolve;
            this.resolve = null;
            // 清理,防止下次误判
            this.dialogElement.returnValue = "";
            this.bodyElement.textContent = "";
            resolve?.(ok);
        });

        // 处理cancel事件
        EventUtil.bind(this.dialogElement, "cancel", () => {
            this.dialogElement.close("cancel");
        });

        // 确认按钮
        EventUtil.bind(this.confirmBtnElement, "click", () => {
            this.dialogElement.close("confirm");
        });

        // 取消按钮
        EventUtil.bind(this.cancelBtnElement, "click", () => {
            this.dialogElement.close("cancel");
        });

        // 右上角关闭按钮
        EventUtil.bind(this.closeBtnElement, "click", () => {
            this.dialogElement.close("cancel");
        });
    }

    /**
     * 设置正文内容
     * @param  content - 正文内容
     */
    private setBodyContent(content: Node | string) {
        if (content instanceof Node) {
            this.bodyElement.replaceChildren(content);
        } else {
            this.bodyElement.textContent = content;
        }
    }

    // 渲染模板
    private renderTemplate() {
        const template = document.createElement("template");
        template.innerHTML = this.template().trim();
        return template.content.firstElementChild as HTMLDialogElement;
    }

    private template() {
        return `
      <dialog class="dialog">
          <header class="header">
            <span class="title"></span>
            <span class="close-btn" title="关闭">✖</span>
          </header>
          <section class="body"></section>
          <footer class="footer">
            <button type="button" class="cancel-btn">取消</button>
            <button type="button" class="confirm-btn">确定</button>
          </footer>
      </dialog>
    `;
    }
}
