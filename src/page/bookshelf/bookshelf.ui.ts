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

import Overlay from "../../core/component/overlay/overlay";
import Dialog from "../../core/component/dialog/dialog";

/**
 * 书架界面
 * @author allurx
 */
export default class BookshelfUi {
    overlay: Overlay;
    dialog: Dialog;

    constructor() {
        this.overlay = new Overlay();
        this.dialog = new Dialog();
    }

    /**
     * 在执行处理函数时显示遮罩
     * @param  handler - 处理函数
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
    async alertDialog(content: Node | string, options: object = {}): Promise<void> {
        await this.dialog.alert(content, options);
    }
}
