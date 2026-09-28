/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import { assertExists } from "@/utils/assert-util";
import { delegate, bind } from "@/utils/event-util";
import type TocEntry from "@/domain/toc/toc-entry";

/**
 * 用章节及其可视偏移恢复位置，避免响应式换行丢失浏览上下文。
 */
interface TocScrollPosition {
    chapterNumber: number | undefined;
    offset: number;
    scrollTop: number;
}

/**
 * 目录面板
 */
export default class TocUi extends Ui {
    private readonly dialog: HTMLDialogElement;
    private readonly tocContentElement: HTMLElement;
    private readonly closeButton: HTMLButtonElement;
    private readonly locateCurrentButton: HTMLButtonElement;
    private readonly currentChapterTitle: HTMLElement;
    private readonly searchInput: HTMLInputElement;
    private readonly emptyMessage: HTMLElement;
    private readonly summary: HTMLElement;
    private entries: TocEntry[] = [];
    private currentChapterNumber = 1;
    private chapterButtons: HTMLButtonElement[] = [];
    private unfilteredPosition: TocScrollPosition | undefined;
    private browsingPosition: TocScrollPosition | undefined;
    private lastLayout = "";
    private query = "";
    private selectingChapter = false;

    /**
     * 使用原生对话框提供焦点约束和 Escape 关闭。
     */
    public constructor(root: HTMLDialogElement) {
        super(root);
        this.dialog = root;
        this.tocContentElement = assertExists(this.root.querySelector<HTMLElement>(".main"));
        this.closeButton = assertExists(this.root.querySelector<HTMLButtonElement>(".close"));
        this.locateCurrentButton = assertExists(this.root.querySelector<HTMLButtonElement>(".locate-current"));
        this.currentChapterTitle = assertExists(this.root.querySelector<HTMLElement>(".toc-current-title"));
        this.searchInput = assertExists(this.root.querySelector<HTMLInputElement>("#toc-search"));
        this.emptyMessage = assertExists(this.root.querySelector<HTMLElement>(".toc-empty"));
        this.summary = assertExists(this.root.querySelector<HTMLElement>(".toc-summary"));
    }

    /**
     * 显示目录；首次定位当前章节，后续恢复目录自身的滚动位置。
     * @returns 切换后目录是否打开。
     */
    public toggleToc(): boolean {
        if (this.dialog.open) {
            this.close();
            return false;
        }

        // 先进入原生模态并建立焦点，再恢复章节列表的浏览位置。
        this.dialog.inert = false;
        this.dialog.showModal();
        this.closeButton.focus({ preventScroll: true });
        if (this.browsingPosition) this.restorePosition(this.browsingPosition);
        else this.centerCurrentChapter();

        this.capturePosition();
        return true;
    }

    /**
     * 记住列表位置；取消沿用原生入口焦点恢复，选章关闭由调用方将焦点交给正文。
     */
    public close(reason: "cancel" | "chapter-selected" = "cancel"): void {
        this.restoreAfterResize();
        this.capturePosition();
        this.dialog.close(reason);
        // 退场绘制期间保留视觉连续性，但不再让已关闭的章节参与焦点遍历。
        this.dialog.inert = true;
    }

    /**
     * 标记当前章节；不强制改变用户正在浏览的目录位置。
     */
    public highlightCurrentChapter(chapterNumber: number): this {
        this.currentChapterNumber = chapterNumber;

        // 顶部入口从完整目录读取当前章，搜索隐藏该行时仍能识别并定位。
        const currentEntry = this.entries.find((entry) => entry.chapterNumber === chapterNumber);
        this.currentChapterTitle.textContent = currentEntry?.title ?? "";
        this.locateCurrentButton.title = currentEntry?.title ?? "";
        this.locateCurrentButton.hidden = !currentEntry;
        this.locateCurrentButton.setAttribute("aria-label", `定位当前章节：${currentEntry?.title ?? ""}`);

        for (const button of this.tocContentElement.querySelectorAll("button")) {
            const current = Number(button.dataset["chapterNumber"]) === chapterNumber;
            button.classList.toggle("active", current);
            if (current) button.setAttribute("aria-current", "location");
            else button.removeAttribute("aria-current");
        }
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
     * 等待选章处理成功才收起目录；失败保留面板供重试，销毁后不再更新界面。
     */
    public delegateTocItemClick(handler: (chapterNumber: number) => Promise<void>, signal: AbortSignal): this {
        delegate(
            this.tocContentElement,
            "button[data-chapter-number]",
            "click",
            async (_, target) => {
                if (this.selectingChapter) return;
                this.selectingChapter = true;
                this.tocContentElement.setAttribute("aria-busy", "true");
                try {
                    await handler(Number(target.dataset["chapterNumber"]));
                    if (!signal.aborted && this.dialog.open) this.close("chapter-selected");
                } finally {
                    this.selectingChapter = false;
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
    public bindTocClose(handler: (chapterSelected: boolean) => void, signal: AbortSignal): this {
        let composing = false;

        // 尺寸改变时恢复章节锚点，普通滚动才更新当前浏览快照。
        const observer = new ResizeObserver(() => {
            this.restoreAfterResize();
        });
        observer.observe(this.dialog);
        observer.observe(this.tocContentElement);
        bind(
            this.tocContentElement,
            "scroll",
            () => {
                // 布局变化可能钳制 scrollTop；此时保留变更前的章节锚点。
                if (this.dialog.open && this.layoutSignature() === this.lastLayout) this.capturePosition();
            },
            { signal, passive: true }
        );

        // 关闭按钮和 Escape 统一保存位置，close 事件只负责通知页面恢复焦点。
        bind(
            this.closeButton,
            "click",
            () => {
                this.close();
            },
            { signal }
        );
        bind(
            this.dialog,
            "cancel",
            (event) => {
                event.preventDefault();
                if (!composing) this.close();
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
            },
            { signal }
        );
        bind(
            this.dialog,
            "close",
            () => {
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
                this.capturePosition();
                this.unfilteredPosition = this.browsingPosition;
            }
            this.query = nextQuery;
            this.renderFilteredEntries();
            this.restorePosition(this.query ? undefined : this.unfilteredPosition);
            this.capturePosition();
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

        // 模态与 Observer 随页面销毁，防止离开后继续读取旧节点几何信息。
        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                this.dialog.close();
                this.dialog.inert = true;
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
        this.query = "";
        this.renderFilteredEntries();

        // 将当前章放入视口并更新恢复锚点，不改变正文的阅读进度。
        const current = this.centerCurrentChapter();
        current?.focus({ preventScroll: true });
        this.capturePosition();
        this.unfilteredPosition = this.browsingPosition;
    }

    /**
     * 当前章只在章节列表内居中，避免 scrollIntoView 连带滚动阅读器或页面根节点。
     */
    private centerCurrentChapter(): HTMLButtonElement | null {
        const current = this.tocContentElement.querySelector<HTMLButtonElement>('[aria-current="location"]');
        if (current) {
            const viewport = this.tocContentElement.getBoundingClientRect();
            const row = current.getBoundingClientRect();
            this.tocContentElement.scrollTop +=
                row.top -
                viewport.top -
                this.tocContentElement.clientTop -
                (this.tocContentElement.clientHeight - row.height) / 2;
        }
        return current;
    }

    /**
     * 尺寸变化后的 scroll 事件不能覆盖变化前的位置。
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
     * 二分查找可视区上缘的章节，长目录滚动时只读取少量节点的几何信息。
     */
    private capturePosition(): void {
        // 上缘坐标包含容器边框，查找第一个未完全滚出视口的章节。
        const container = this.tocContentElement;
        const top = container.getBoundingClientRect().top + container.clientTop;
        let low = 0;
        let high = this.chapterButtons.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            const button = assertExists(this.chapterButtons[middle]);
            if (button.getBoundingClientRect().bottom <= top) low = middle + 1;
            else high = middle;
        }

        // 保存章节相对上缘的偏移；空结果同时保留原生 scrollTop 作为回退。
        const button = this.chapterButtons[Math.min(low, this.chapterButtons.length - 1)];
        this.browsingPosition = {
            chapterNumber: button ? Number(button.dataset["chapterNumber"]) : undefined,
            offset: button ? button.getBoundingClientRect().top - top : 0,
            scrollTop: container.scrollTop,
        };

        // 快照只适用于采集时的尺寸，布局变化后的 scroll 不能覆盖它。
        this.lastLayout = this.layoutSignature();
    }

    /**
     * 将同一章节放回原可视偏移；无结果时使用容器的原生边界钳制。
     */
    private restorePosition(position: TocScrollPosition | undefined): void {
        // 以稳定章号跨筛选结果与响应式换行寻找原锚点。
        const container = this.tocContentElement;
        const button = position
            ? this.chapterButtons.find((item) => Number(item.dataset["chapterNumber"]) === position.chapterNumber)
            : undefined;

        // 按新几何位置补偿滚动差；章号不在当前结果中时退回原生像素位置。
        if (button && position) {
            const top = container.getBoundingClientRect().top + container.clientTop;
            container.scrollTop += button.getBoundingClientRect().top - top - position.offset;
        } else container.scrollTop = position?.scrollTop ?? 0;
    }

    /**
     * 只在布局变化时恢复浏览锚点，不在普通滚动中追踪当前阅读章。
     */
    private restoreAfterResize(): void {
        if (!this.dialog.open) return;
        if (this.layoutSignature() === this.lastLayout) return;
        this.restorePosition(this.browsingPosition);
        this.keepFocusedElementVisible();
        this.capturePosition();
    }

    /**
     * 尺寸变化后保持聚焦章节可见；头部和工具区始终位于列表滚动区之外。
     */
    private keepFocusedElementVisible(): void {
        const focused = document.activeElement;
        const container = this.tocContentElement;
        if (!(focused instanceof HTMLElement) || focused === container || !container.contains(focused)) return;

        // 扣除边框和滚动留白，得到聚焦控件应保持可见的实际区域。
        const bounds = container.getBoundingClientRect();
        const style = getComputedStyle(container);
        const top = bounds.top + container.clientTop + (Number.parseFloat(style.scrollPaddingTop) || 0);
        const bottom =
            bounds.top +
            container.clientTop +
            container.clientHeight -
            (Number.parseFloat(style.scrollPaddingBottom) || 0);
        const target = focused.getBoundingClientRect();

        // 仅补偿越界部分，避免无必要地重置整个目录位置。
        if (target.top < top) container.scrollTop += target.top - top;
        else if (target.bottom > bottom) container.scrollTop += target.bottom - bottom;
    }

    /**
     * 根据标题筛选目录，保留总章数和当前章标记。
     */
    private renderFilteredEntries(): void {
        // 先得到匹配结果，再离线构造按钮；外部章名始终作为文本写入。
        const entries = this.entries.filter((entry) => entry.title.toLocaleLowerCase().includes(this.query));
        const fragment = document.createDocumentFragment();
        this.chapterButtons = [];
        for (const entry of entries) {
            // 可见标题与悬停标题保留原文，章号用于委托选择和浏览锚点恢复。
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = entry.title;
            button.dataset["chapterNumber"] = String(entry.chapterNumber);
            button.title = entry.title;

            // DOM 顺序与缓存顺序一致，几何二分查找据此定位首个可见章节。
            this.chapterButtons.push(button);
            fragment.appendChild(button);
        }

        // 一次替换列表并同步空态、统计和当前章标记，保留已有空态节点。
        this.tocContentElement.replaceChildren(this.emptyMessage, fragment);
        this.emptyMessage.hidden = entries.length > 0;
        this.summary.textContent = this.query
            ? `找到 ${String(entries.length)} / ${String(this.entries.length)} 章`
            : `共 ${String(this.entries.length)} 章`;
        this.highlightCurrentChapter(this.currentChapterNumber);
    }
}
