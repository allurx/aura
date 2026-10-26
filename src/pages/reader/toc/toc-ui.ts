/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import enableLightDismiss from "@/components/dialog/light-dismiss";
import enablePanelFrame, { type PanelFrameBinding } from "@/components/dialog/panel-frame";
import { bindSearchInput } from "@/components/search-field/search-input";
import { assertExists } from "@/utils/assert-util";
import { delegate, bind } from "@/utils/event-util";
import type TocEntry from "@/domain/toc/toc-entry";
import TocWindow, { type TocScrollPosition } from "./toc-window";

/**
 * 可搜索的目录面板，独立保存目录浏览位置，不随正文进度强制滚动。
 */
export default class TocUi extends Ui {
    private readonly dialog: HTMLDialogElement;
    private readonly tocContentElement: HTMLElement;
    private readonly closeButton: HTMLButtonElement;
    private readonly locateCurrentButton: HTMLButtonElement;
    private readonly searchInput: HTMLInputElement;
    private readonly emptyMessage: HTMLElement;
    private readonly summary: HTMLElement;
    private readonly chapterWindow: TocWindow;
    private entries: TocEntry[] = [];
    private currentChapterNumber = 1;
    private unfilteredPosition: TocScrollPosition | undefined;
    private browsingPosition: TocScrollPosition | undefined;
    private lastLayout = "";
    private query = "";
    private selectingChapter = false;
    private resizeObserver: ResizeObserver | undefined;
    private pendingLayout: "open" | "search" | "locate" | undefined;

    /**
     * 使用原生对话框提供焦点约束和 Escape 关闭。
     */
    public constructor(
        root: HTMLDialogElement,
        private readonly opener: HTMLButtonElement,
        private readonly canOpen: () => boolean
    ) {
        super(root);
        this.dialog = root;
        this.tocContentElement = assertExists(this.root.querySelector<HTMLElement>(".main"));
        this.closeButton = assertExists(this.root.querySelector<HTMLButtonElement>(".close"));
        this.locateCurrentButton = assertExists(this.root.querySelector<HTMLButtonElement>(".locate-current"));
        this.searchInput = assertExists(this.root.querySelector<HTMLInputElement>("#toc-search"));
        this.emptyMessage = assertExists(this.root.querySelector<HTMLElement>(".toc-empty"));
        this.summary = assertExists(this.root.querySelector<HTMLElement>(".toc-summary"));
        this.chapterWindow = new TocWindow(this.tocContentElement);
    }

    /**
     * 原生模态打开前准备状态，布局完成后再恢复目录自身的浏览位置。
     */
    private prepareOpen(): void {
        this.dialog.returnValue = "cancel";
        this.opener.setAttribute("aria-expanded", "true");
        this.dialog.inert = false;
        this.scheduleLayout("open");
    }

    /**
     * 记住列表位置；取消沿用原生入口焦点恢复，选章关闭由调用方将焦点交给正文。
     */
    public close(reason: "cancel" | "chapter-selected" = "cancel"): void {
        this.prepareClose();
        this.dialog.close(reason);
    }

    /**
     * 浏览位置由滚动和布局回调维护；关闭不再测量即将退场的列表。
     */
    private prepareClose(): void {
        this.opener.setAttribute("aria-expanded", "false");
        // 退场绘制期间保留视觉连续性，但不再让已关闭的章节参与焦点遍历。
        this.dialog.inert = true;
    }

    /**
     * 标记当前章节；不强制改变用户正在浏览的目录位置。
     */
    public highlightCurrentChapter(chapterNumber: number): this {
        this.currentChapterNumber = chapterNumber;
        // 搜索可能隐藏当前章，定位入口仍依据完整目录判断是否可用。
        this.locateCurrentButton.disabled = !this.entries.some((entry) => entry.chapterNumber === chapterNumber);
        this.chapterWindow.highlightChapter(chapterNumber);
        return this;
    }

    /**
     * 保存章节条目并使用安全文本节点生成可键盘操作的目录。
     */
    public renderEntries(entries: TocEntry[]): this {
        this.entries = entries;
        this.renderFilteredEntries();
        return this;
    }

    /**
     * 等待选章实际完成才收起目录；忙碌中未接受或失败时保留面板，销毁后不再更新界面。
     */
    public delegateTocItemClick(handler: (chapterNumber: number) => Promise<boolean>, signal: AbortSignal): this {
        delegate(
            this.tocContentElement,
            "button[data-chapter-number]",
            "click",
            async (_, target) => {
                if (this.selectingChapter) return;
                this.selectingChapter = true;
                this.chapterWindow.retainChapter(Number(target.dataset["chapterNumber"]));
                try {
                    // 正文先读取当前布局，再显示列表忙碌状态，避免游标样式变化触发整列同步重算。
                    const selection = handler(Number(target.dataset["chapterNumber"]));
                    this.tocContentElement.setAttribute("aria-busy", "true");
                    const selected = await selection;
                    if (selected && !signal.aborted && this.dialog.open) this.close("chapter-selected");
                } finally {
                    this.selectingChapter = false;
                    this.chapterWindow.retainChapter(undefined);
                    if (!signal.aborted) this.tocContentElement.removeAttribute("aria-busy");
                }
            },
            { signal }
        );
        return this;
    }

    /**
     * 绑定搜索、关闭与滚动恢复；页面销毁时移除监听、断开 Observer 并关闭原生目录。
     */
    public bindTocClose(
        handler: (chapterSelected: boolean) => void,
        signal: AbortSignal,
        panelFrame: PanelFrameBinding
    ): this {
        let composing = false;
        enableLightDismiss(this.dialog, signal);
        const titleBar = assertExists(this.dialog.querySelector<HTMLElement>(":scope > header"));
        enablePanelFrame(
            this.dialog,
            titleBar,
            () => !this.dialog.parentElement?.hasAttribute("data-mobile-controls"),
            panelFrame,
            signal
        );

        // 尺寸改变时恢复章节锚点，普通滚动才更新当前浏览快照。
        const observer = new ResizeObserver(() => {
            this.restoreAfterResize();
        });
        this.resizeObserver = observer;
        observer.observe(this.dialog);
        observer.observe(this.tocContentElement);
        this.chapterWindow.bindEvents(
            signal,
            () => !this.pendingLayout && this.dialog.open && this.layoutSignature() === this.lastLayout,
            (position) => {
                this.browsingPosition = position;
            }
        );

        // 原生按钮命令承担模态激活，脚本只检查阅读状态并准备浏览位置。
        if ("commandForElement" in HTMLButtonElement.prototype) {
            this.opener.commandForElement = this.dialog;
            this.opener.command = "show-modal";
            this.closeButton.commandForElement = this.dialog;
            this.closeButton.command = "request-close";
            bind(
                this.dialog,
                "command",
                (event) => {
                    if (!(event instanceof CommandEvent) || event.command !== "show-modal") return;
                    if (event.source !== this.opener || !this.canOpen()) {
                        event.preventDefault();
                        return;
                    }
                    this.prepareOpen();
                },
                { signal }
            );
        } else {
            bind(
                this.opener,
                "click",
                () => {
                    if (!this.canOpen() || this.dialog.open) return;
                    this.prepareOpen();
                    this.dialog.showModal();
                },
                { signal }
            );
            bind(
                this.closeButton,
                "click",
                () => {
                    this.close();
                },
                { signal }
            );
        }

        // 关闭按钮、外点和 Escape 共用取消流程；输入法候选优先处理 Escape。
        bind(
            this.dialog,
            "cancel",
            (event) => {
                if (composing) event.preventDefault();
                else this.prepareClose();
            },
            { signal }
        );
        bind(
            this.dialog,
            "keydown",
            (event: KeyboardEvent) => {
                // 取消输入法候选不能同时执行原生 dialog 的 Escape 关闭。
                if (event.key === "Escape" && (event.isComposing || composing)) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                if (!composing) {
                    this.chapterWindow.moveFocus(
                        event,
                        this.searchInput,
                        titleBar.tabIndex === 0
                            ? titleBar
                            : this.locateCurrentButton.disabled
                              ? this.closeButton
                              : this.locateCurrentButton
                    );
                }
            },
            { signal }
        );
        bind(
            this.dialog,
            "close",
            () => {
                if (this.dialog.open) return;
                this.prepareClose();
                composing = false;
                handler(this.dialog.returnValue === "chapter-selected");
            },
            { signal }
        );

        // 定位当前章会清除筛选；搜索清空则恢复搜索前的浏览位置。
        bind(
            this.locateCurrentButton,
            "click",
            () => {
                this.locateCurrentChapter();
            },
            { signal }
        );

        // 候选输入不重建目录；compositionend 后重复到达的 input 按标准化查询去重。
        const updateSearch = (): void => {
            const nextQuery = this.searchInput.value.trim().toLocaleLowerCase();
            if (nextQuery === this.query) return;
            if (!this.query && nextQuery) {
                this.unfilteredPosition = this.browsingPosition;
            }
            this.query = nextQuery;
            this.browsingPosition = this.query
                ? { chapterNumber: undefined, offset: 0, scrollTop: 0 }
                : this.unfilteredPosition;
            this.renderFilteredEntries();
            this.scheduleLayout("search");
        };
        bind(
            this.searchInput,
            "compositionstart",
            () => {
                composing = true;
            },
            { signal }
        );
        bind(
            this.searchInput,
            "compositionend",
            () => {
                composing = false;
                updateSearch();
            },
            { signal }
        );
        bind(
            this.searchInput,
            "input",
            (event) => {
                if (!composing && (!(event instanceof InputEvent) || !event.isComposing)) updateSearch();
            },
            { signal }
        );
        bindSearchInput(this.searchInput, this.tocContentElement, () => composing, signal);

        // 模态与 Observer 随页面销毁，防止离开后继续读取旧节点几何信息。
        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                this.resizeObserver = undefined;
                this.pendingLayout = undefined;
                this.prepareClose();
                this.dialog.close();
            },
            { once: true }
        );
        return this;
    }

    /**
     * 清除筛选并定位当前章节，只改变目录浏览位置。
     */
    private locateCurrentChapter(): void {
        // 当前章可能被筛选隐藏，先恢复完整目录再定位。
        this.searchInput.value = "";
        if (this.query) {
            this.query = "";
            this.renderFilteredEntries();
        }

        this.browsingPosition = undefined;
        this.scheduleLayout("locate");
    }

    /**
     * 用面板和列表尺寸识别布局变化，防止其触发的 scroll 事件覆盖旧浏览锚点。
     */
    private layoutSignature(): string {
        return [
            this.dialog.clientWidth,
            this.dialog.clientHeight,
            this.tocContentElement.clientWidth,
            this.tocContentElement.clientHeight,
        ].join(":");
    }

    /**
     * 从窗口高度表保存章节位置，避免读取未挂载章节的几何信息。
     */
    private capturePosition(): void {
        this.browsingPosition = this.chapterWindow.capturePosition();
        // 快照只适用于采集时的尺寸，布局变化后的 scroll 不能覆盖它。
        this.lastLayout = this.layoutSignature();
    }

    /**
     * 打开、筛选和定位先完成 DOM 写入，再由已有观察器在自然布局后处理位置。
     */
    private scheduleLayout(action: "open" | "search" | "locate"): void {
        this.pendingLayout = action;
        this.resizeObserver?.unobserve(this.tocContentElement);
        this.resizeObserver?.observe(this.tocContentElement);
    }

    /**
     * 布局后恢复目录浏览锚点；只有首次打开和显式定位才跟随当前阅读章。
     */
    private restoreAfterResize(): void {
        if (!this.dialog.open) return;
        const action = this.pendingLayout;
        if (!action && this.layoutSignature() === this.lastLayout) return;
        this.pendingLayout = undefined;
        const followCurrent = action === "locate" || (action === "open" && !this.browsingPosition);
        const current = this.chapterWindow.updateLayout(
            this.browsingPosition,
            followCurrent ? this.currentChapterNumber : undefined
        );
        this.capturePosition();
        if (action === "locate") {
            this.unfilteredPosition = this.browsingPosition;
            current?.focus({ preventScroll: true });
        }
    }

    /**
     * 根据标题筛选目录，保留总章数和当前章标记。
     */
    private renderFilteredEntries(): void {
        // 搜索仍覆盖完整目录，挂载范围仅由可视窗口决定。
        const entries = this.entries.filter((entry) => entry.title.toLocaleLowerCase().includes(this.query));
        this.chapterWindow.setEntries(entries);
        this.emptyMessage.hidden = entries.length > 0;
        this.summary.textContent = this.query
            ? `找到 ${String(entries.length)} / ${String(this.entries.length)} 章`
            : `共 ${String(this.entries.length)} 章`;
        this.highlightCurrentChapter(this.currentChapterNumber);
    }
}
