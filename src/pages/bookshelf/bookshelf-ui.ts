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

import PageUi from "@/pages/page-ui";
import { assertExists } from "@/utils/assert-util";

/**
 * 书架页面的操作状态与共用对话框。
 * @author allurx
 */
export default class BookshelfUi extends PageUi {
    private feedbackTimer: number | undefined;
    private signal?: AbortSignal;

    /**
     * 将反馈计时器绑定到页面生命周期。
     * 页面离开时取消待确认对话框，避免挂起的处理器恢复后继续操作。
     */
    public bindLifecycle(signal: AbortSignal): void {
        this.signal = signal;

        // 页面销毁统一清理反馈和仍在等待用户确认的对话框。
        signal.addEventListener(
            "abort",
            () => {
                window.clearTimeout(this.feedbackTimer);
                for (const dialog of this.root.querySelectorAll<HTMLDialogElement>(".dialog[open]"))
                    dialog.close("cancel");
            },
            { once: true }
        );
    }

    /**
     * 操作期间封锁键盘与指针输入并显示单一状态，结束后恢复先前的交互状态与可归还的焦点。
     * 只管理交互状态，不取消 handler 中已经开始的数据操作。
     */
    public async runBusy(
        message: string,
        handler: (setStatus: (message: string) => void) => Promise<void>
    ): Promise<void> {
        // 只封锁侧栏与主内容，遮罩自身仍能播报处理状态。
        const regions = Array.from(this.root.children).filter(
            (element): element is HTMLElement =>
                element instanceof HTMLElement && (element.id === "bookshelf-sidebar" || element.tagName === "MAIN")
        );
        const previousStates = regions.map((element) => ({
            element,
            inert: element.inert,
            busy: element.getAttribute("aria-busy"),
        }));
        const previousFocus = document.activeElement;

        // 复用遮罩中的单一播报区域，避免批次进度被 inert 区域屏蔽或重复朗读。
        const status = assertExists(this.root.querySelector<HTMLElement>(".overlay .overlay-message"));
        const previousStatus = status.textContent;
        status.textContent = message;

        // 仅内容区域进入 busy 状态，进度播报留在其外，不等待整批操作结束。
        regions.forEach((element) => {
            element.inert = true;
            element.setAttribute("aria-busy", "true");
        });

        try {
            await this.showOverlayWhile(() =>
                handler((message) => {
                    if (this.root.isConnected) status.textContent = message;
                })
            );
        } finally {
            previousStates.forEach(({ element, inert, busy }) => {
                element.inert = inert;
                if (busy === null) element.removeAttribute("aria-busy");
                else element.setAttribute("aria-busy", busy);
            });
            status.textContent = previousStatus;

            // 用户主动移动过焦点或页面已退出时，不再归还旧焦点。
            if (
                !this.signal?.aborted &&
                previousFocus instanceof HTMLElement &&
                previousFocus.isConnected &&
                document.activeElement === document.body
            )
                previousFocus.focus({ preventScroll: true });
        }
    }

    /**
     * 成功反馈不打断操作，自动消退并受页面生命周期管理。
     */
    public showFeedback(message: string): void {
        if (this.signal?.aborted) return;
        const status = assertExists(this.root.querySelector<HTMLElement>("#shelf-feedback"));
        window.clearTimeout(this.feedbackTimer);
        status.textContent = message;
        status.hidden = false;
        this.feedbackTimer = window.setTimeout(() => {
            status.hidden = true;
        }, 3200);
    }
}
