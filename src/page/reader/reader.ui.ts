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
 * 阅读器界面
 * @author allurx
 */
import Overlay from "../../core/component/overlay/overlay";
import Dialog from "../../core/component/dialog/dialog";
import { assertExists } from "../../core/util/assert.util";

/**
 * 阅读器界面
 * @author allurx
 */
export default class ReaderUi {
    private element: HTMLElement;
    private overlay: Overlay;
    private dialog: Dialog;

    constructor() {
        this.element = assertExists(document.querySelector<HTMLElement>("#reader"));
        this.dialog = new Dialog();
        this.overlay = new Overlay({
            containerElement: this.element,
            overlayStyle: { position: "absolute" },
        });
    }

    renderWidth(width: number) {
        this.element.style.width = String(width) + "px";
        return this;
    }

    renderFontColor(fontColor: string) {
        this.element.style.color = fontColor;
        return this;
    }

    renderBackgroundColor(backgroundColor: string) {
        this.element.style.backgroundColor = backgroundColor;
        return this;
    }

    /**
     * 显示阅读器
     */
    show() {
        this.element.classList.add("visible");
    }

    /**
     * 在执行处理函数时显示遮罩
     * @param handler - 处理函数
     */
    async showOverlayWhile(handler: () => Promise<void>) {
        await this.overlay.showWhile(handler);
    }

    /**
     * 显示确认对话框
     * @param  content 正文内容
     * @param options 选项
     * @returns  用户是否确认
     */
    async confirmDialog(content: Node | string, options: object = {}): Promise<boolean> {
        return await this.dialog.confirm(content, options);
    }

    /**
     * 显示警告对话框
     * @param  content 正文内容
     * @param options 选项
     */
    async alertDialog(content: Node | string, options: object = {}): Promise<boolean> {
        return await this.dialog.alert(content, options);
    }

    /**
     * 绑定阅读器尺寸变化事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    observeReaderResize(handler: (width: number) => Promise<void>) {
        new ResizeObserver(
            (() => {
                let timer: number;
                return (entries) => {
                    if (timer) clearTimeout(timer);
                    timer = window.setTimeout(() => {
                        void (async () => {
                            // reader
                            const entry = assertExists(entries[0]);
                            const width = entry.contentRect.width;
                            console.log("检测到页面宽度变化：", width);
                            await handler(width);
                        })();
                    }, 300);
                };
            })()
        ).observe(this.element);
        return this;
    }
}
