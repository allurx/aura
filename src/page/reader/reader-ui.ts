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

import Overlay from "@/component/overlay/overlay";
import Dialog from "@/component/dialog/dialog";
import { assertExists } from "@/util/assert-util";
import Ui from "@/component/ui";
import EventUtil from "@/util/event-util";

/**
 * 阅读器界面
 * @author allurx
 */
export default class ReaderUi extends Ui {
    public readonly dialog: Dialog;
    public readonly overlay: Overlay;
    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.dialog = new Dialog({ containerElement: this.root });
        this.overlay = new Overlay({ containerElement: this.root });
    }

    /**
     * 显示已经完成初始化的阅读器内容。
     */
    public show(): this {
        this.root.classList.add("visible");
        return this;
    }

    /**
     * 绑定阅读器尺寸变化事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public observeReaderResize(handler: (width: string) => Promise<void>, signal: AbortSignal): this {
        let timer: number | undefined;
        const observer = new ResizeObserver((entries) => {
            if (timer !== undefined) window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                EventUtil.run(async () => {
                    if (signal.aborted) return;
                    const width = assertExists(entries[0]).contentRect.width;
                    console.log("检测到页面宽度变化：", width);
                    await handler(`${String(width)}px`);
                });
            }, 300);
        });

        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                if (timer !== undefined) window.clearTimeout(timer);
            },
            { once: true }
        );
        observer.observe(this.root);
        return this;
    }

    public showOverlay(): Promise<void> {
        return this.overlay.show();
    }

    public hideOverlay(): Promise<void> {
        return this.overlay.hide();
    }

    public showOverlayWhile(handler: () => Promise<void>): Promise<void> {
        return this.overlay.showWhile(handler);
    }

    public async confirmDialog(content: Node | string, options: object = {}): Promise<boolean> {
        return await this.dialog.confirm(content, options);
    }

    public async alertDialog(content: Node | string, options: object = {}): Promise<boolean> {
        return await this.dialog.alert(content, options);
    }
}
