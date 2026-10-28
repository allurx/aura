/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import Dialog from "@/components/dialog/dialog";
import Overlay from "@/components/overlay/overlay";
import { assertExists } from "@/utils/assert-util";
import { createElementFromHtml } from "@/utils/dom-util";
import type { CategoryId } from "@/domain/category/category";

/**
 * 批量操作的明确范围；null 表示所有分类，不受书名搜索影响。
 */
export interface BookOperationScope {
    categoryId: CategoryId | null;
    name: string;
    count: number;
}

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
                this.dialog.cancel();
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
                    <p>
                        将清除全部书籍、分类归属、阅读进度和外观设置。<strong class="reset-warning-irreversible">此操作无法撤销。</strong>
                    </p>
                    <ol class="recovery-steps">
                        <li>请先另存原文件，未备份请取消。</li>
                        <li>重新导入不会恢复分类归属、阅读进度和外观设置。</li>
                    </ol>
                </div>
            `),
            { title: "重置数据", confirmBtnText: "清除全部数据", destructive: true }
        );
    }

    /**
     * 在同一窗口选择批量范围并确认；每次打开默认当前分类，空范围不能执行。
     */
    public async confirmBookOperation(
        action: "clear" | "export",
        scopes: readonly BookOperationScope[],
        searchActive: boolean
    ): Promise<BookOperationScope | null> {
        const content = createElementFromHtml(`
            <div class="book-operation">
                <fieldset><legend>范围</legend></fieldset>
                <p class="book-operation-search" hidden>包含未匹配搜索的书籍。</p>
                <p class="book-operation-description" aria-live="polite"></p>
                <p class="book-operation-note"></p>
            </div>
        `);
        const options = assertExists(content.querySelector("fieldset"));
        const description = assertExists(content.querySelector(".book-operation-description"));
        const note = assertExists(content.querySelector<HTMLElement>(".book-operation-note"));
        assertExists(content.querySelector<HTMLElement>(".book-operation-search")).hidden = !searchActive;
        note.hidden = action === "clear";
        note.textContent = "不含分类归属、阅读进度和外观设置。";

        let selected = assertExists(scopes[0]);
        const update = () => {
            const target = selected.categoryId === null ? "全部书籍" : selected.name;
            description.textContent =
                selected.count === 0
                    ? "此范围内没有书籍。"
                    : action === "clear"
                      ? `将删除 ${String(selected.count)} 本书及其阅读进度，此操作无法撤销。`
                      : `将 ${String(selected.count)} 本书的原文件打包为 ZIP。`;
            this.dialog.setConfirmAction(`${action === "clear" ? "清空" : "导出"}${target}`, selected.count === 0);
        };

        // 原生单选按钮提供整行点击与键盘操作；分类名称只作为文本挂载。
        for (const scope of scopes) {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "radio";
            input.name = "book-operation-scope";
            input.value = scope.categoryId === null ? "all" : "category";
            input.checked = scope === selected;
            const name = document.createElement("span");
            name.textContent = `${scope.categoryId === null ? "全部书籍" : `当前分类：${scope.name}`}（${String(scope.count)} 本）`;
            input.addEventListener("change", () => {
                if (!input.checked) return;
                selected = scope;
                update();
            });
            label.append(input, name);
            options.append(label);
        }

        const confirmation = this.dialog.confirm(content, {
            title: action === "clear" ? "清空书籍" : "导出原文件",
            destructive: action === "clear",
        });
        update();
        return (await confirmation) ? selected : null;
    }

    /**
     * 操作期间封锁键盘与指针输入并显示单一状态，结束后恢复先前的交互状态与可归还的焦点。
     * 只管理交互状态，不取消 handler 中已经开始的数据操作。
     */
    public async runBusy(
        message: string,
        handler: (setStatus: (message: string) => void) => Promise<void>
    ): Promise<void> {
        // 忙碌状态只封锁稳定内容，抽屉自身的 inert 继续由响应式导航管理。
        const regions = [
            assertExists(this.root.querySelector<HTMLElement>("#nav")),
            assertExists(this.root.querySelector<HTMLElement>(":scope > main")),
        ];
        const previousStates = regions.map((element) => ({
            element,
            inert: element.inert,
            busy: element.getAttribute("aria-busy"),
        }));
        const previousFocus = document.activeElement;

        // 仅内容区域进入 busy 状态，进度播报留在其外，不等待整批操作结束。
        regions.forEach((element) => {
            element.inert = true;
            element.setAttribute("aria-busy", "true");
        });

        try {
            await this.overlay.showWhile(handler, message);
        } finally {
            previousStates.forEach(({ element, inert, busy }) => {
                element.inert = inert;
                if (busy === null) element.removeAttribute("aria-busy");
                else element.setAttribute("aria-busy", busy);
            });

            // 用户主动移动过焦点或页面已退出时，不再归还旧焦点。
            if (
                !this.signal?.aborted &&
                previousFocus instanceof HTMLElement &&
                previousFocus.isConnected &&
                document.activeElement === document.body
            ) {
                // 列表替换后的目标由具体操作决定，不抢占删除等流程的结果焦点。
                previousFocus.focus({ preventScroll: true });
            }
        }
    }

    /**
     * 成功反馈不打断操作，自动消退并受页面生命周期管理。
     */
    public showFeedback(message: string): void {
        if (this.signal?.aborted) return;
        const status = assertExists(this.root.querySelector<HTMLElement>("#shelf-feedback"));
        window.clearTimeout(this.feedbackTimer);
        assertExists(status.querySelector<HTMLElement>(".feedback-message")).textContent = message;
        status.hidden = false;
        this.feedbackTimer = window.setTimeout(() => {
            status.hidden = true;
        }, 3200);
    }
}
