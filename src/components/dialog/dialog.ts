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

import EventUtil from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";

/**
 * 提示与确认的按钮配置；只有确认模式需要取消按钮文案。
 */
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
 * 可复用的原生模态对话框；同一实例需等待上次请求结束后再使用。
 * @author allurx
 */
export default class Dialog {
    private readonly dialogElement: HTMLDialogElement;
    private readonly titleElement: HTMLSpanElement;
    private readonly closeButton: HTMLButtonElement;
    private readonly bodyElement: HTMLElement;
    private readonly cancelBtnElement: HTMLButtonElement;
    private readonly confirmBtnElement: HTMLButtonElement;
    private resolve: ((ok: boolean) => void) | null = null;

    /**
     * 将可复用对话框挂载到所属页面或应用容器，并关联独立的无障碍标题。
     */
    public constructor({ containerElement }: { containerElement: HTMLElement }) {
        // 对话框根节点与无障碍标题。
        this.dialogElement = containerElement.appendChild(this.renderTemplate());
        this.titleElement = assertExists(this.dialogElement.querySelector<HTMLSpanElement>(".title"));
        this.titleElement.id = `dialog-title-${crypto.randomUUID()}`;
        this.dialogElement.setAttribute("aria-labelledby", this.titleElement.id);

        // 正文与操作入口复用同一组节点，每次打开只更新内容和显隐。
        this.closeButton = assertExists(this.dialogElement.querySelector<HTMLButtonElement>(".close-btn"));
        this.bodyElement = assertExists(this.dialogElement.querySelector<HTMLElement>(".body"));
        this.cancelBtnElement = assertExists(this.dialogElement.querySelector<HTMLButtonElement>(".cancel-btn"));
        this.confirmBtnElement = assertExists(this.dialogElement.querySelector<HTMLButtonElement>(".confirm-btn"));

        // 将按钮、Escape 和程序关闭统一接入结果结算。
        this.bindEvents();
    }

    /**
     * 显示提示，隐藏取消按钮；关闭按钮和 Escape 仍可取消。
     * @returns 点击确定为 true，其他关闭方式为 false。
     */
    public async alert(content: Node | string, { title = "提示", confirmBtnText = "确定" } = {}) {
        return this.show({ type: "alert", content, title, confirmBtnText });
    }

    /**
     * 显示需要明确确认的操作提示。
     * @returns 点击确定为 true，取消、关闭或 Escape 为 false。
     */
    public async confirm(
        content: Node | string,
        { title = "确认", confirmBtnText = "确定", cancelBtnText = "取消" } = {}
    ) {
        return this.show({ type: "confirm", content, title, confirmBtnText, cancelBtnText });
    }

    /**
     * 为当前请求配置内容，结果由原生 close 事件统一结算。
     */
    private async show(request: DialogRequest): Promise<boolean> {
        // 更新本次请求的标题、正文和确认文案。
        this.titleElement.textContent = request.title;
        this.setBodyContent(request.content);
        this.confirmBtnElement.textContent = request.confirmBtnText;

        // 提示模式与确认模式共用结构，仅调整取消入口。
        if (request.type === "alert") {
            this.cancelBtnElement.hidden = true;
        } else {
            this.cancelBtnElement.hidden = false;
            this.cancelBtnElement.textContent = request.cancelBtnText;
        }

        // 保留当前请求的完成回调，由原生 close 事件返回用户选择。
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.dialogElement.showModal();
        });
    }

    /**
     * 将所有关闭路径收敛到 close 事件，清理可复用状态后返回结果。
     */
    private bindEvents() {
        // 所有关闭路径先清空复用状态，再通知当前调用方。
        EventUtil.bind(this.dialogElement, "close", () => {
            const ok = this.dialogElement.returnValue === "confirm";
            const resolve = this.resolve;
            this.resolve = null;

            // 避免上次的确认结果和内容影响下次打开。
            this.dialogElement.returnValue = "";
            this.bodyElement.textContent = "";
            resolve?.(ok);
        });

        // Escape 与显式取消使用相同的返回值。
        EventUtil.bind(this.dialogElement, "cancel", () => {
            this.dialogElement.close("cancel");
        });

        // 显式操作入口只设置结果，继续交给统一关闭流程处理。
        EventUtil.bind(this.confirmBtnElement, "click", () => {
            this.dialogElement.close("confirm");
        });

        EventUtil.bind(this.cancelBtnElement, "click", () => {
            this.dialogElement.close("cancel");
        });

        EventUtil.bind(this.closeButton, "click", () => {
            this.dialogElement.close("cancel");
        });
    }

    /**
     * 字符串作为纯文本显示；传入的节点直接挂载，由调用方负责安全构造。
     * @param content - 正文文本或由调用方创建的节点。
     */
    private setBodyContent(content: Node | string) {
        if (content instanceof Node) {
            this.bodyElement.replaceChildren(content);
        } else {
            this.bodyElement.textContent = content;
        }
    }

    /**
     * 仅解析应用内置模板，外部内容通过 setBodyContent 写入。
     */
    private renderTemplate() {
        const template = document.createElement("template");
        template.innerHTML = this.template().trim();
        return template.content.firstElementChild as HTMLDialogElement;
    }

    /**
     * 返回提示与确认共用的静态结构，原生 dialog 负责模态焦点约束。
     */
    private template() {
        return `
      <dialog class="dialog panel-scroll">
          <header class="header">
            <span class="title"></span>
            <button type="button" class="close-btn icon-button" aria-label="关闭" title="关闭">
                <span class="icon icon-close" aria-hidden="true"></span>
            </button>
          </header>
          <section class="body panel-scroll" tabindex="0" aria-label="提示内容"></section>
          <footer class="footer">
            <button type="button" class="cancel-btn">取消</button>
            <button type="button" class="confirm-btn">确定</button>
          </footer>
      </dialog>
    `;
    }
}
