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

import Dialog from "@/component/dialog/dialog";
import Dialogable from "@/component/dialog/dialogable";
import Overlay from "@/component/overlay/overlay";
import Overlayable from "@/component/overlay/overlayable";
import Ui from "@/component/ui";

/**
 * 页面根界面基类，统一提供对话框和遮罩能力。
 * @author allurx
 */
export default abstract class PageUi extends Ui implements Dialogable, Overlayable {
    public readonly dialog: Dialog;
    public readonly overlay: Overlay;

    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.dialog = new Dialog({ containerElement: this.root });
        this.overlay = new Overlay({ containerElement: this.root });
    }

    /**
     * @see Overlayable.showOverlay
     */
    public showOverlay(): Promise<void> {
        return this.overlay.show();
    }

    /**
     * @see Overlayable.hideOverlay
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
    public confirmDialog(content: Node | string, options: object = {}): Promise<boolean> {
        return this.dialog.confirm(content, options);
    }

    /**
     * @see Dialogable.alertDialog
     */
    public alertDialog(content: Node | string, options: object = {}): Promise<boolean> {
        return this.dialog.alert(content, options);
    }
}
