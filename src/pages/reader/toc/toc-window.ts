/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type TocEntry from "@/domain/toc/toc-entry";
import { assertExists } from "@/utils/assert-util";
import { bind, run } from "@/utils/event-util";

/**
 * 目录会话中的章节锚点；offset 是章节上缘相对列表视窗上缘的偏移。
 */
export interface TocScrollPosition {
    chapterNumber: number | undefined;
    offset: number;
    scrollTop: number;
}

/**
 * 按实际行高维护目录窗口，完整章节仍用于搜索、定位和键盘顺序。
 * 未测量行的高度只用于临时滚动范围，不进入书籍的阅读进度。
 */
export default class TocWindow {
    private readonly windowElement = document.createElement("div");
    private entries: readonly TocEntry[] = [];
    private readonly indexes = new Map<number, number>();
    private readonly rows = new Map<number, HTMLDivElement>();
    private readonly heights = new Map<number, number>();
    private offsets = [0];
    // 未排版行暂按单行估计；换行及字体的实际尺寸始终由 CSS 和 Observer 决定。
    private readonly estimatedHeight = 50;
    private width = 0;
    private viewportHeight = 0;
    private currentChapterNumber = 1;
    private operatingChapter: number | undefined;
    private centeredChapter: number | undefined;
    private restoringPosition: TocScrollPosition | undefined;
    private focusToReveal: number | undefined;
    private scrollPadding = 0;
    private expectedScrollTop = 0;
    private observer: ResizeObserver | undefined;
    private frame: number | undefined;
    private canUpdate: () => boolean = () => false;
    private onPosition: (position: TocScrollPosition) => void = () => undefined;

    /**
     * 保留章节导航容器，用独立列表提供窗口条目的总数和顺序语义。
     */
    public constructor(private readonly root: HTMLElement) {
        this.windowElement.className = "toc-window";
        this.windowElement.setAttribute("role", "list");
        this.root.append(this.windowElement);
    }

    /**
     * 更新完整筛选结果，沿用相同宽度下已经测得的章节高度。
     */
    public setEntries(entries: readonly TocEntry[]): void {
        for (const row of this.rows.values()) this.observer?.unobserve(row);
        this.rows.clear();
        this.windowElement.replaceChildren();
        this.entries = entries;
        this.indexes.clear();
        entries.forEach((entry, index) => this.indexes.set(entry.chapterNumber, index));
        this.centeredChapter = undefined;
        this.restoringPosition = undefined;
        this.focusToReveal = undefined;
        this.rebuildOffsets();
        this.renderWindow(0);
    }

    /**
     * 高亮只更新已挂载的条目，离窗条目创建时读取同一章号。
     */
    public highlightChapter(chapterNumber: number): void {
        if (chapterNumber === this.currentChapterNumber) return;
        this.currentChapterNumber = chapterNumber;
        for (const [number, row] of this.rows) this.updateHighlight(row, number);
    }

    /**
     * 异步选章期间保留来源条目，滚动或焦点变化不销毁正在操作的节点。
     */
    public retainChapter(chapterNumber: number | undefined): void {
        this.operatingChapter = chapterNumber;
        this.scheduleWindow();
    }

    /**
     * 尺寸变化使旧换行高度失效；直接恢复浏览锚点，或按指定章号居中。
     * 居中时返回已挂载的按钮，供显式定位操作交接焦点。
     */
    public updateLayout(
        position: TocScrollPosition | undefined,
        chapterToCenter?: number
    ): HTMLButtonElement | undefined {
        const width = this.root.clientWidth;
        const height = this.root.clientHeight;
        if (width !== this.width || height !== this.viewportHeight) {
            const focused = document.activeElement;
            this.focusToReveal =
                focused instanceof HTMLButtonElement && this.root.contains(focused)
                    ? Number(focused.dataset["chapterNumber"])
                    : undefined;
            this.scrollPadding = Number.parseFloat(getComputedStyle(this.root).scrollPaddingTop) || 0;
        }
        this.viewportHeight = height;
        if (width !== this.width) {
            this.width = width;
            this.heights.clear();
            this.rebuildOffsets();
            // 旧高度已经失效，仍挂载的节点也需重新提供当前尺寸。
            for (const row of this.rows.values()) {
                this.observer?.unobserve(row);
                this.observer?.observe(row);
            }
        }
        const centeredIndex = chapterToCenter === undefined ? undefined : this.indexes.get(chapterToCenter);
        this.centeredChapter = centeredIndex === undefined ? undefined : chapterToCenter;
        if (centeredIndex !== undefined) {
            this.restoringPosition = undefined;
            this.focusToReveal = undefined;
            this.setScroll(this.centeredScrollTop(centeredIndex), centeredIndex);
            return this.buttonAt(centeredIndex);
        }

        // 换行后的真实高度尚未送达时，旧偏移可能超出估计行高；不能据此改选锚点。
        this.restoringPosition =
            position?.chapterNumber !== undefined && !this.heights.has(position.chapterNumber) ? position : undefined;
        this.restorePosition(position);
        return undefined;
    }

    /**
     * 只读取滚动位置和高度表，不对离窗章节请求 DOM 布局。
     */
    public capturePosition(): TocScrollPosition {
        if (this.restoringPosition) return this.restoringPosition;
        const scrollTop = this.root.scrollTop;
        const index = this.indexAt(scrollTop);
        return {
            chapterNumber: this.entries[index]?.chapterNumber,
            offset: (this.offsets[index] ?? 0) - scrollTop,
            scrollTop,
        };
    }

    /**
     * Tab 按完整结果前后移动，越过结果边界时交还原生模态焦点循环。
     */
    public moveFocus(event: KeyboardEvent, search: HTMLElement, firstControl: HTMLElement): void {
        if (
            event.key !== "Tab" ||
            event.isComposing ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            !this.entries.length
        )
            return;
        const focused = document.activeElement;
        const number = focused instanceof HTMLButtonElement ? focused.dataset["chapterNumber"] : undefined;
        const index = number === undefined ? undefined : this.indexes.get(Number(number));
        let next: number | undefined;
        if (index !== undefined) next = index + (event.shiftKey ? -1 : 1);
        else if (focused === search && !event.shiftKey) next = 0;
        else if (focused === firstControl && event.shiftKey) next = this.entries.length - 1;
        if (next === undefined || next < 0 || next >= this.entries.length) return;

        event.preventDefault();
        this.centeredChapter = undefined;
        this.restoringPosition = undefined;
        this.focusToReveal = assertExists(this.entries[next]).chapterNumber;
        this.setScroll(this.revealFocusedScrollTop(this.root.scrollTop), next);
        this.buttonAt(next)?.focus({ preventScroll: true });
        this.onPosition(this.capturePosition());
    }

    /**
     * 监听实际行高、滚动和焦点；关闭期间保留窗口但不继续排版。
     */
    public bindEvents(
        signal: AbortSignal,
        canUpdate: () => boolean,
        onPosition: (position: TocScrollPosition) => void
    ): void {
        this.canUpdate = canUpdate;
        this.onPosition = onPosition;
        this.observer = new ResizeObserver((entries) => {
            if (!this.canUpdate()) return;
            run(() => {
                this.measureRows(entries);
            });
        });
        for (const row of this.rows.values()) this.observer.observe(row);
        bind(
            this.root,
            "scroll",
            () => {
                if (!this.canUpdate()) return;
                if (Math.abs(this.root.scrollTop - this.expectedScrollTop) > 1) {
                    this.centeredChapter = undefined;
                    this.restoringPosition = undefined;
                    this.focusToReveal = undefined;
                }
                this.onPosition(this.capturePosition());
                this.scheduleWindow();
            },
            { signal, passive: true }
        );
        bind(
            this.root,
            "focusin",
            () => {
                this.scheduleWindow();
            },
            { signal }
        );
        bind(
            this.root,
            "focusout",
            () => {
                this.scheduleWindow();
            },
            { signal }
        );
        signal.addEventListener(
            "abort",
            () => {
                this.observer?.disconnect();
                this.observer = undefined;
                if (this.frame !== undefined) cancelAnimationFrame(this.frame);
                this.frame = undefined;
                this.canUpdate = () => false;
            },
            { once: true }
        );
    }

    /**
     * 滚动与焦点变化合并到下一帧，保留行不重新挂载或测量。
     */
    private scheduleWindow(): void {
        if (this.frame !== undefined || !this.canUpdate()) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = undefined;
            run(() => {
                if (!this.canUpdate()) return;
                this.renderWindow(this.root.scrollTop);
                this.onPosition(this.capturePosition());
            });
        });
    }

    /**
     * 自然布局给出行高后、绘制前校正位置，长标题不会按估计高度互相覆盖。
     */
    private measureRows(entries: ResizeObserverEntry[]): void {
        const position = this.capturePosition();
        let changed = false;
        for (const entry of entries) {
            if (!(entry.target instanceof HTMLElement)) continue;
            const number = Number(entry.target.dataset["chapterNumber"]);
            const height = entry.borderBoxSize[0]?.blockSize;
            if (height && this.rows.get(number) === entry.target && this.heights.get(number) !== height) {
                this.heights.set(number, height);
                changed = true;
            }
        }
        if (!changed) return;
        this.rebuildOffsets();
        for (const [number, row] of this.rows) {
            const index = assertExists(this.indexes.get(number));
            row.style.top = `${String(assertExists(this.offsets[index]))}px`;
        }

        // 观察器只移动已有行，不增删被观察节点，后续窗口更新留给下一帧。
        const current = this.centeredChapter === undefined ? undefined : this.indexes.get(this.centeredChapter);
        this.root.scrollTop =
            current === undefined
                ? this.revealFocusedScrollTop(this.scrollTopFor(position))
                : this.centeredScrollTop(current);
        this.expectedScrollTop = this.root.scrollTop;
        if (
            this.restoringPosition?.chapterNumber !== undefined &&
            this.heights.has(this.restoringPosition.chapterNumber)
        )
            this.restoringPosition = undefined;
        this.onPosition(this.capturePosition());
        this.scheduleWindow();
    }

    /**
     * 高度前缀只在筛选、换行或实际行高变化时重算，滚动查找保持对数成本。
     */
    private rebuildOffsets(): void {
        this.offsets = [0];
        let offset = 0;
        for (const entry of this.entries) {
            offset += this.heights.get(entry.chapterNumber) ?? this.estimatedHeight;
            this.offsets.push(offset);
        }
        this.windowElement.style.height = `${String(offset)}px`;
    }

    /**
     * 查找覆盖滚动坐标的条目，列表为空时返回零供空态使用。
     */
    private indexAt(offset: number): number {
        let low = 0;
        let high = this.entries.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (assertExists(this.offsets[middle + 1]) <= offset) low = middle + 1;
            else high = middle;
        }
        return Math.min(low, Math.max(0, this.entries.length - 1));
    }

    /**
     * 窗口保留上下各半屏，另保留焦点和异步操作行，离窗节点及时释放。
     */
    private renderWindow(scrollTop: number, extraIndex?: number): void {
        const buffer = Math.max(this.viewportHeight / 2, this.estimatedHeight * 2);
        const first = this.indexAt(Math.max(0, scrollTop - buffer));
        const last = this.indexAt(scrollTop + this.viewportHeight + buffer);
        const wanted = new Set<number>();
        for (let index = first; index <= last && index < this.entries.length; index++) wanted.add(index);
        if (extraIndex !== undefined) wanted.add(extraIndex);
        const focused = document.activeElement;
        const focusedNumber =
            focused instanceof HTMLButtonElement && this.root.contains(focused)
                ? Number(focused.dataset["chapterNumber"])
                : undefined;
        for (const number of [focusedNumber, this.operatingChapter]) {
            const index = number === undefined ? undefined : this.indexes.get(number);
            if (index !== undefined) wanted.add(index);
        }

        // 节点始终按完整目录顺序排列，原生焦点离开列表时仍得到正确相邻控件。
        const indexes = [...wanted].sort((a, b) => a - b);
        const numbers = new Set(indexes.map((index) => assertExists(this.entries[index]).chapterNumber));
        for (const [number, row] of this.rows) {
            if (numbers.has(number)) continue;
            this.observer?.unobserve(row);
            row.remove();
            this.rows.delete(number);
        }
        let cursor = this.windowElement.firstElementChild;
        for (const index of indexes) {
            const entry = assertExists(this.entries[index]);
            let row = this.rows.get(entry.chapterNumber);
            if (!row) {
                row = document.createElement("div");
                row.className = "toc-row";
                row.dataset["chapterNumber"] = String(entry.chapterNumber);
                row.setAttribute("role", "listitem");
                row.setAttribute("aria-posinset", String(index + 1));
                row.setAttribute("aria-setsize", String(this.entries.length));
                row.toggleAttribute("data-last", index === this.entries.length - 1);
                const button = document.createElement("button");
                button.type = "button";
                button.dataset["chapterNumber"] = String(entry.chapterNumber);
                button.textContent = entry.title;
                button.title = entry.title;
                row.append(button);
                this.rows.set(entry.chapterNumber, row);
                this.updateHighlight(row, entry.chapterNumber);
                this.observer?.observe(row);
            }
            const top = `${String(assertExists(this.offsets[index]))}px`;
            if (row.style.top !== top) row.style.top = top;
            if (row === cursor) cursor = cursor.nextElementSibling;
            else this.windowElement.insertBefore(row, cursor);
        }
    }

    /**
     * 章节锚点优先于旧像素位置，原生滚动边界负责首尾钳制。
     */
    private restorePosition(position: TocScrollPosition | undefined): void {
        const index = position?.chapterNumber === undefined ? undefined : this.indexes.get(position.chapterNumber);
        this.setScroll(this.revealFocusedScrollTop(this.scrollTopFor(position)), index);
    }

    /**
     * 键盘导航和响应式变化共用焦点可见范围；未测量时保留目标，等待真实行高校正。
     */
    private revealFocusedScrollTop(scrollTop: number): number {
        const number = this.focusToReveal;
        if (number === undefined) return scrollTop;
        if (this.heights.has(number)) this.focusToReveal = undefined;
        const index = this.indexes.get(number);
        if (index === undefined) return scrollTop;
        const top = assertExists(this.offsets[index]);
        const bottom = assertExists(this.offsets[index + 1]);
        if (top < scrollTop + this.scrollPadding || bottom - top > this.viewportHeight - this.scrollPadding * 2)
            return top - this.scrollPadding;
        return Math.max(scrollTop, bottom - this.viewportHeight + this.scrollPadding);
    }

    /**
     * 将章节锚点映射到本轮高度表，空结果沿用原生像素边界。
     */
    private scrollTopFor(position: TocScrollPosition | undefined): number {
        const index = position?.chapterNumber === undefined ? undefined : this.indexes.get(position.chapterNumber);
        return index === undefined
            ? (position?.scrollTop ?? 0)
            : assertExists(this.offsets[index]) - (position?.offset ?? 0);
    }

    /**
     * 先更新滚动范围与窗口，再写入 scrollTop，避免缩短后的原生钳制覆盖锚点。
     */
    private setScroll(scrollTop: number, extraIndex?: number): void {
        this.renderWindow(Math.max(0, scrollTop), extraIndex);
        this.root.scrollTop = scrollTop;
        this.expectedScrollTop = this.root.scrollTop;
    }

    /**
     * 目录当前章居中按条目实际高度计算，未测量时暂用估计值。
     */
    private centeredScrollTop(index: number): number {
        const top = assertExists(this.offsets[index]);
        const height = assertExists(this.offsets[index + 1]) - top;
        return top - (this.viewportHeight - height) / 2;
    }

    /**
     * 获取已经挂载的章节按钮，避免按标题构造选择器。
     */
    private buttonAt(index: number): HTMLButtonElement | undefined {
        const entry = this.entries[index];
        const button = entry ? this.rows.get(entry.chapterNumber)?.firstElementChild : undefined;
        return button instanceof HTMLButtonElement ? button : undefined;
    }

    /**
     * 当前章视觉与辅助技术状态从同一章号派生。
     */
    private updateHighlight(row: HTMLElement, chapterNumber: number): void {
        const button = assertExists(row.firstElementChild);
        const current = chapterNumber === this.currentChapterNumber;
        button.classList.toggle("active", current);
        if (current) button.setAttribute("aria-current", "location");
        else button.removeAttribute("aria-current");
    }
}
