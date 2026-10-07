/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import Dialog from "@/components/dialog/dialog";
import Overlay from "@/components/overlay/overlay";
import { assertExists } from "@/utils/assert-util";
import { createElementFromHtml } from "@/utils/dom-util";

/**
 * 书架页面的操作状态与共用对话框。
 */
export default class BookshelfUi extends Ui {
    public readonly dialog = new Dialog({ containerElement: this.root });
    private readonly overlay = new Overlay(this.root);
    private feedbackTimer: number | undefined;
    private signal?: AbortSignal;
    private readonly downloads = new Map<string, number>();

    /**
     * 浏览器负责保存位置与取消；保留短暂 URL 生命周期，让下载读取原始 Blob。
     */
    public download(source: Blob, name: string): void {
        const url = URL.createObjectURL(source);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.hidden = true;
        this.root.append(link);
        link.click();
        link.remove();
        const timer = window.setTimeout(() => {
            URL.revokeObjectURL(url);
            this.downloads.delete(url);
        }, 60_000);
        this.downloads.set(url, timer);
    }

    /**
     * 将反馈计时器绑定到页面生命周期。
     * 页面离开时取消待确认对话框，避免挂起的处理器恢复后继续操作。
     */
    public bindLifecycle(signal: AbortSignal): void {
        this.signal = signal;
        signal.addEventListener(
            "abort",
            () => {
                for (const [url, timer] of this.downloads) {
                    window.clearTimeout(timer);
                    URL.revokeObjectURL(url);
                }
                this.downloads.clear();
            },
            { once: true }
        );

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
     * 确认清除全部本地数据，以危险语义和分段内容说明操作后果。
     */
    public confirmDataReset(): Promise<boolean> {
        return this.dialog.confirm(
            createElementFromHtml(`
                <div class="reset-warning">
                    <p class="reset-warning-title">
                        <span class="icon icon-warning" aria-hidden="true"></span><strong>此操作无法撤销</strong>
                    </p>
                    <p>将清除全部本地数据，包括书籍、阅读进度和外观设置。</p>
                    <p class="reset-warning-note">请先保留原始书籍文件，并关闭其他 Aura 页面。<br>完成后自动刷新。</p>
                </div>
            `),
            { title: "重置数据", confirmBtnText: "清除全部数据", destructive: true }
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
            await this.overlay.showWhile(() =>
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
