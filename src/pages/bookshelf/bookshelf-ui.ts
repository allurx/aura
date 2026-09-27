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
     * 将吸顶测量和反馈计时器绑定到页面生命周期。
     * 页面离开时取消待确认对话框，避免挂起的处理器恢复后继续操作。
     */
    public bindLifecycle(signal: AbortSignal): void {
        this.signal = signal;
        const main = assertExists(this.root.querySelector<HTMLElement>("main"));
        const header = assertExists(main.querySelector<HTMLElement>("#header"));

        /**
         * 标题只在能为书籍留下足够空间时吸顶，焦点滚动同时避开其真实高度。
         */
        const updateStickyHeader = (): void => {
            const height = header.getBoundingClientRect().height;
            main.style.setProperty("--bookshelf-header-height", `${String(height)}px`);
            main.toggleAttribute("data-sticky-header", height <= main.clientHeight / 3);
        };

        // 工具栏或主区域尺寸变化时重新判断吸顶空间。
        const observer = new ResizeObserver(updateStickyHeader);
        observer.observe(main);
        observer.observe(header);
        updateStickyHeader();

        // 页面销毁统一清理测量、反馈和仍在等待用户确认的对话框。
        signal.addEventListener(
            "abort",
            () => {
                window.clearTimeout(this.feedbackTimer);
                observer.disconnect();
                for (const dialog of this.root.querySelectorAll<HTMLDialogElement>(".dialog[open]"))
                    dialog.close("cancel");
            },
            { once: true }
        );
    }

    /**
     * 操作期间封锁键盘与指针输入并显示单一状态，结束后恢复先前的 inert 状态与可归还的焦点。
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
        const previousInert = regions.map((element) => element.inert);
        const previousFocus = document.activeElement;

        // 将批次进度放在遮罩内，避免被 inert 区域屏蔽。
        const status = document.createElement("p");
        status.className = "operation-status";
        status.setAttribute("role", "status");
        status.textContent = message;
        assertExists(this.root.querySelector(".overlay")).append(status);

        // 当前操作独占输入，结束时按原状态恢复而非一律解除 inert。
        regions.forEach((element) => {
            element.inert = true;
        });
        this.root.setAttribute("aria-busy", "true");

        try {
            await this.showOverlayWhile(() =>
                handler((message) => {
                    if (this.root.isConnected) status.textContent = message;
                })
            );
        } finally {
            regions.forEach((element, index) => {
                element.inert = previousInert[index] ?? false;
            });
            this.root.removeAttribute("aria-busy");
            status.remove();

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

    /**
     * 清除上次导入问题摘要，也供用户手动关闭结果。
     */
    public clearImportResult(): void {
        const status = assertExists(this.root.querySelector<HTMLElement>("#import-result"));
        status.hidden = true;
        status.replaceChildren();
    }

    /**
     * 未导入文件保留可展开明细，用户可主动关闭。
     */
    public renderImportResult(message: string, description?: string): void {
        if (this.signal?.aborted) return;

        // 新批次替换旧结果，状态区域继续承担摘要播报。
        const status = assertExists(this.root.querySelector<HTMLElement>("#import-result"));
        status.hidden = false;
        status.replaceChildren();

        // 摘要始终可见，文件名与结果文字均作为纯文本写入。
        const heading = document.createElement("p");
        heading.textContent = message;

        // 用户可以独立关闭结果，关闭监听与当前页面一同结束。
        const close = document.createElement("button");
        close.type = "button";
        close.className = "icon-button import-result-close";
        close.setAttribute("aria-label", "关闭导入结果");
        const icon = document.createElement("span");
        icon.className = "icon icon-close";
        icon.setAttribute("aria-hidden", "true");
        close.append(icon);
        close.addEventListener(
            "click",
            () => {
                this.clearImportResult();
            },
            { signal: assertExists(this.signal) }
        );

        status.append(heading, close);

        // 较长文件明细折叠展示，并提供可聚焦的滚动正文。
        if (description) {
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            summary.textContent = "查看导入明细";

            const content = document.createElement("p");
            content.className = "import-details";
            content.tabIndex = 0;
            content.setAttribute("aria-label", "导入明细");
            content.textContent = description;

            details.append(summary, content);
            status.append(details);
        }
    }
}
