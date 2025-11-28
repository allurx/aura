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

import Overlay from "../../../component/overlay/overlay";
import Dialog from "../../../component/dialog/dialog";
import { assertExists } from "../../../util/assert-util";
import Ui from "../../../component/ui";
import Dialogable from "../../../component/dialog/dalogable";
import Overlayable from "../../../component/overlay/overlayable";

/**
 * 阅读器界面
 * @author allurx
 */
export default class BodyUi extends Ui implements Dialogable, Overlayable {
    public readonly dialog: Dialog;
    public readonly overlay: Overlay;
    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.dialog = new Dialog({ containerElement: this.root });
        this.overlay = new Overlay({ containerElement: this.root });
    }

    /**
     * 绑定阅读器尺寸变化事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public observeReaderResize(handler: (width: string) => Promise<void>) {
        new ResizeObserver(
            (() => {
                let timer: number;
                return (entries) => {
                    if (timer) clearTimeout(timer);
                    timer = window.setTimeout(() => {
                        void (async () => {
                            const entry = assertExists(entries[0]);
                            const width = entry.contentRect.width;
                            console.log("检测到页面宽度变化：", width);
                            await handler(String(width) + "px");
                        })();
                    }, 300);
                };
            })()
        ).observe(this.root);
        return this;
    }

    /**
     * @see Overlayable.show
     */
    public showOverlay(): Promise<void> {
        return this.overlay.show();
    }

    /**
     * @see Overlayable.hide
     */
    public hideOverlay(): Promise<void> {
        return this.overlay.hide();
    }

    /**
     * @see Overlayable.showOverlayWhile
     */
    public showOverlayWhile(handler: () => Promise<void>): Promise<void> {
        return this.overlay.showWhile(handler);
    }

    /**
     * @see Dialogable.confirmDialog
     */
    public async confirmDialog(content: Node | string, options: object = {}): Promise<boolean> {
        return await this.dialog.confirm(content, options);
    }

    /**
     * @see Dialogable.confirmDialog
     */
    public async alertDialog(content: Node | string, options: object = {}): Promise<boolean> {
        return await this.dialog.alert(content, options);
    }
}
