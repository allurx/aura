/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind, delegate, run } from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import Ui from "@/components/ui";
import type { BookSummary } from "../bookshelf-service";
import BookCardUi from "./book-card-ui";

/**
 * 控制器按完整书架和当前筛选区分空态，列表不自行推断领域状态。
 */
export type BookListEmptyState = "library" | "category" | "search";

/**
 * 当前页会话中的内容锚点；offset 是视窗上缘在锚点所在行内的偏移。
 */
export interface BookListPosition {
    bookId: string;
    offset: number;
}

/**
 * 仅挂载可见行、缓冲行和正在操作的书卡，完整摘要仍用于筛选和导航。
 */
export default class BookListUi extends Ui {
    private books: readonly BookSummary[] = [];
    private readonly bookIndexes = new Map<string, number>();
    // 离开窗口且没有操作的节点及时释放，滚遍全书架也不积累 DOM 缓存。
    private readonly bookCards = new Map<string, BookCardUi>();
    private readonly rows = new Map<number, HTMLElement>();
    private readonly windowElement = document.createElement("div");
    private readonly operatingBooks = new Set<string>();
    private layout = { columns: 1, rowHeight: 0, rowGap: 0, paddingTop: 0, paddingBottom: 0, viewportHeight: 0 };
    private position: BookListPosition | null = null;
    private resizeObserver: ResizeObserver | undefined;
    private observedBook: HTMLElement | undefined;
    private frame: number | undefined;

    /**
     * 共同滚动内容只承担总高度，行内排版继续由页面 CSS 决定。
     */
    public constructor(root: HTMLElement) {
        super(root);
        this.windowElement.className = "book-window";
        this.windowElement.setAttribute("role", "presentation");
    }

    /**
     * 尚无摘要时明确展示读取或失败状态；重试只读取本地数据。
     */
    public renderLoadState(state: "loading" | "error"): void {
        const focusedInside = this.root.contains(document.activeElement);
        this.clearWindow();
        const status = document.createElement("div");
        status.className = "shelf-status";
        status.setAttribute("role", "status");
        if (state === "loading") {
            status.classList.add("shelf-loading");
            status.append(this.createShelfIllustration());
        }

        const title = document.createElement(state === "loading" ? "p" : "h2");
        title.textContent = state === "loading" ? "正在读取书架…" : "书架未能加载";
        status.append(title);

        if (state === "error") {
            const hint = document.createElement("p");
            hint.className = "shelf-empty-hint";
            hint.textContent = "请重试读取，或通过管理与帮助处理本地数据。";
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "shelf-retry";
            retry.textContent = "重新读取";
            status.append(hint, retry);
        }
        this.root.replaceChildren(status);
        if (focusedInside) this.root.focus({ preventScroll: true });
    }

    /**
     * 返回时恢复仍在当前列表中的书籍；加载期间用户已移走焦点则保持原处。
     */
    public restoreBookFocus(bookId: string): void {
        if (!bookId || document.activeElement !== document.body) return;
        const index = this.bookIndexes.get(bookId);
        if (index !== undefined) this.focusBook(index, ".book-open", false);
    }

    /**
     * 保留可见行中的同一书籍锚点，避免连续换列时逐次改选行首而向前漂移。
     */
    public capturePosition(scrollTop = this.root.scrollTop): BookListPosition | null {
        if (!this.books.length || !this.layout.rowHeight) return null;
        const top = scrollTop - this.layout.paddingTop;
        const row = Math.max(0, Math.floor(top / (this.layout.rowHeight + this.layout.rowGap)));
        const previous = this.position ? this.bookIndexes.get(this.position.bookId) : undefined;
        const index =
            previous !== undefined && Math.floor(previous / this.layout.columns) === row
                ? previous
                : Math.min(row * this.layout.columns, this.books.length - 1);
        const book = this.books[index];
        return book ? { bookId: book.book.id, offset: top - row * (this.layout.rowHeight + this.layout.rowGap) } : null;
    }

    /**
     * 更新完整筛选结果，仅构造当前位置附近的书卡。
     * @param position - undefined 保留内容锚点，null 回顶部，其他值恢复指定锚点。
     */
    public renderBooks(books: BookSummary[], emptyState: BookListEmptyState, position?: BookListPosition | null): void {
        const anchor = position === undefined ? this.capturePosition() : position;
        const anchorIndex = anchor ? this.bookIndexes.get(anchor.bookId) : undefined;
        const active = document.activeElement;
        const focused = active instanceof HTMLOptionElement ? active.closest("select") : active;
        const focusedInside = focused instanceof HTMLElement && this.root.contains(focused);
        const focusId = focusedInside ? focused.closest<HTMLElement>(".book")?.dataset["id"] : undefined;
        const previousIndex = focusId ? this.bookIndexes.get(focusId) : undefined;
        const focusClass =
            focused instanceof HTMLSelectElement
                ? ".book-category"
                : focused instanceof HTMLElement && focused.classList.contains("book-more")
                  ? ".book-more"
                  : ".book-open";

        this.books = books;
        this.bookIndexes.clear();
        books.forEach((summary, index) => this.bookIndexes.set(summary.book.id, index));
        if (!books.length) {
            this.clearWindow();
            this.root.replaceChildren(this.createEmptyState(emptyState));
        } else {
            // 锚点书籍被删除时，接续它原位置的相邻书目。
            const nextAnchor =
                anchor && !this.bookIndexes.has(anchor.bookId)
                    ? {
                          bookId: assertExists(books[Math.min(anchorIndex ?? 0, books.length - 1)]).book.id,
                          offset: anchor.offset,
                      }
                    : anchor;
            this.updateLayout(nextAnchor, true);
        }

        if (focusId && document.activeElement !== focused) {
            const index = this.bookIndexes.get(focusId);
            this.focusBook(
                index ?? Math.min(previousIndex ?? 0, books.length - 1),
                index === undefined ? ".book-open" : focusClass,
                false
            );
        } else if (focusedInside && !this.root.contains(focused) && document.activeElement === document.body) {
            (this.root.querySelector<HTMLElement>(".book-open, .shelf-empty-import") ?? this.root).focus({
                preventScroll: true,
            });
        }
    }

    /**
     * 一张实际书卡提供共同尺寸，CSS Grid 决定列数；稳定滚动条槽使总高度不影响列数。
     */
    private updateLayout(position: BookListPosition | null, refreshBooks = false): void {
        if (!this.books.length) return;
        this.position = position;
        const restoreEmptyFocus =
            this.windowElement.parentElement !== this.root &&
            this.root.contains(document.activeElement) &&
            document.activeElement !== this.root;
        if (this.windowElement.parentElement !== this.root) {
            this.root.dataset["windowed"] = "true";
            this.root.setAttribute("role", "list");
            this.root.replaceChildren(this.windowElement);
        }

        let sample = this.bookCards.values().next().value?.root;
        if (!sample) {
            const summary = assertExists(this.books[0]);
            const card = new BookCardUi(summary);
            this.bookCards.set(summary.book.id, card);
            sample = card.root;
            this.getRow(0).append(sample);
        }
        const row = assertExists(sample.parentElement);
        const listStyle = getComputedStyle(this.root);
        if (!this.root.clientWidth) return;
        const viewportHeight = this.root.clientHeight;
        const previousScrollTop = this.root.scrollTop;
        const previousMaximumTop = Math.max(0, this.root.scrollHeight - viewportHeight);
        const paddingBottom = Number.parseFloat(listStyle.paddingBottom);
        const layout = {
            columns: getComputedStyle(row).gridTemplateColumns.split(/\s+/u).length,
            rowHeight: sample.getBoundingClientRect().height,
            rowGap: Number.parseFloat(listStyle.rowGap),
            paddingTop: Number.parseFloat(listStyle.paddingTop),
            paddingBottom,
            viewportHeight,
        };
        // 滚动窗口更换样本也会收到初始通知；相同几何无需再次写高度、移动书卡或设置滚动位置。
        if (
            !refreshBooks &&
            layout.columns === this.layout.columns &&
            layout.rowHeight === this.layout.rowHeight &&
            layout.rowGap === this.layout.rowGap &&
            layout.paddingTop === this.layout.paddingTop &&
            layout.paddingBottom === this.layout.paddingBottom &&
            layout.viewportHeight === this.layout.viewportHeight
        )
            return;
        this.layout = layout;
        // 空态入口刚被替换时，利用首卡已经完成的测量接续焦点，再挂载其余书卡。
        if (restoreEmptyFocus) sample.querySelector<HTMLElement>(".book-open")?.focus({ preventScroll: true });
        const count = Math.ceil(this.books.length / this.layout.columns);
        const height = count * this.layout.rowHeight + (count - 1) * this.layout.rowGap;

        const index = position ? (this.bookIndexes.get(position.bookId) ?? 0) : 0;
        const offset = position
            ? Math.min(position.offset, this.layout.rowHeight + this.layout.rowGap - 1)
            : -this.layout.paddingTop;
        // 第一行前的负偏移属于顶部留白，响应式 padding 变化不应把未滚动的书架推离顶部。
        const requestedTop =
            index < this.layout.columns && offset < 0
                ? 0
                : this.layout.paddingTop +
                  Math.floor(index / this.layout.columns) * (this.layout.rowHeight + this.layout.rowGap) +
                  offset;
        const maximumTop = Math.max(0, Math.round(this.layout.paddingTop + height + paddingBottom) - viewportHeight);
        const scrollTop = Math.max(0, Math.min(requestedTop, maximumTop));

        // 旧边界已能容纳时，先在干净布局上恢复滚动；扩展边界的场景须等高度生效，避免原生钳制。
        const moveScroll = scrollTop !== previousScrollTop;
        const scrollBeforeRender = scrollTop <= previousMaximumTop;
        if (moveScroll && scrollBeforeRender) this.root.scrollTop = scrollTop;
        this.windowElement.style.height = `${String(height)}px`;
        this.renderWindow(undefined, { scrollTop, height: viewportHeight });
        this.position = this.capturePosition(scrollTop);
        if (moveScroll && !scrollBeforeRender) this.root.scrollTop = scrollTop;
    }

    /**
     * 行容器沿用书架的原生网格，位置由当前共同的行步长决定。
     */
    private getRow(index: number): HTMLElement {
        let row = this.rows.get(index);
        if (!row) {
            row = document.createElement("div");
            row.className = "book-row";
            row.setAttribute("role", "presentation");
            this.rows.set(index, row);
            this.windowElement.append(row);
        }
        row.style.top = `${String(index * (this.layout.rowHeight + this.layout.rowGap))}px`;
        return row;
    }

    /**
     * 保留可见行和上下两行；焦点、菜单及异步操作最多另保留各自所在行。
     */
    private renderWindow(
        extraIndex?: number,
        viewport = { scrollTop: this.root.scrollTop, height: this.root.clientHeight }
    ): void {
        if (!this.books.length || !this.layout.rowHeight) return;
        const { columns, rowHeight, rowGap, paddingTop } = this.layout;
        const step = rowHeight + rowGap;
        const first = Math.max(0, Math.floor((viewport.scrollTop - paddingTop) / step) - 2);
        const last = Math.min(
            Math.ceil(this.books.length / columns),
            Math.ceil((viewport.scrollTop + viewport.height - paddingTop) / step) + 2
        );
        const wantedRows = new Set<number>();
        for (let row = first; row < last; row++) wantedRows.add(row);
        if (extraIndex !== undefined) wantedRows.add(Math.floor(extraIndex / columns));

        const active = document.activeElement;
        const focused = active instanceof HTMLOptionElement ? active.closest("select") : active;
        const focusedInside = focused instanceof HTMLElement && this.root.contains(focused);
        const pinnedIds = new Set(this.operatingBooks);
        for (const element of [focused, ...this.root.querySelectorAll(".book-file-actions:popover-open")]) {
            if (element instanceof Element && this.root.contains(element)) {
                const id = element.closest<HTMLElement>(".book")?.dataset["id"];
                if (id) pinnedIds.add(id);
            }
        }
        for (const id of pinnedIds) {
            const index = this.bookIndexes.get(id);
            if (index !== undefined) wantedRows.add(Math.floor(index / columns));
        }

        // 仅对窗口内变更协调 DOM；保留项不因前面有删除节点而反复重插。
        const wantedBooks = new Set<string>();
        const orderedRows = [...wantedRows].sort((a, b) => a - b);
        for (const index of orderedRows) {
            const row = this.getRow(index);
            const elements: HTMLElement[] = [];
            for (let item = index * columns; item < Math.min((index + 1) * columns, this.books.length); item++) {
                const summary = assertExists(this.books[item]);
                const id = summary.book.id;
                wantedBooks.add(id);
                let card = this.bookCards.get(id);
                if (card) card.update(summary);
                else {
                    card = new BookCardUi(summary);
                    this.bookCards.set(id, card);
                }
                card.root.setAttribute("aria-posinset", String(item + 1));
                card.root.setAttribute("aria-setsize", String(this.books.length));
                elements.push(card.root);
            }
            // 先迁移仍保留的书卡，再统一回收；逐行预先移除会打断换列中的焦点和原生控件状态。
            let cursor = row.firstElementChild;
            for (const element of elements) {
                if (element === cursor) cursor = cursor.nextElementSibling;
                else if (typeof row.moveBefore === "function" && element.isConnected) row.moveBefore(element, cursor);
                else row.insertBefore(element, cursor);
            }
        }
        for (const [index, row] of this.rows) {
            if (!wantedRows.has(index)) {
                row.remove();
                this.rows.delete(index);
            }
        }
        for (const [id, card] of this.bookCards) {
            if (!wantedBooks.has(id)) {
                card.root.remove();
                this.bookCards.delete(id);
            }
        }
        let cursor = this.windowElement.firstElementChild;
        for (const index of orderedRows) {
            const row = assertExists(this.rows.get(index));
            if (row === cursor) cursor = cursor.nextElementSibling;
            else if (typeof this.windowElement.moveBefore === "function") this.windowElement.moveBefore(row, cursor);
            else this.windowElement.insertBefore(row, cursor);
        }

        // 不支持保留节点状态的移动时，仅在协调 DOM 的边界恢复被 insertBefore 打断的焦点。
        if (focusedInside && focused.isConnected && document.activeElement === document.body)
            focused.focus({ preventScroll: true });
        const sample = this.bookCards.values().next().value?.root;
        if (sample !== this.observedBook) {
            if (this.observedBook) this.resizeObserver?.unobserve(this.observedBook);
            this.observedBook = sample;
            if (sample) this.resizeObserver?.observe(sample);
        }
    }

    /**
     * 滚动与焦点变化合并到下一帧，离窗书卡没有独立监听或 Observer。
     */
    private scheduleWindow(): void {
        if (this.frame !== undefined || !this.books.length) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = undefined;
            run(() => {
                this.position = this.capturePosition();
                this.renderWindow();
            });
        });
    }

    /**
     * 按完整结果的索引挂载焦点目标，键盘跨窗口时让目标进入视窗。
     */
    private focusBook(index: number, selector: string, reveal: boolean): void {
        const summary = this.books[index];
        if (!summary) {
            this.root.focus({ preventScroll: true });
            return;
        }
        const viewport = { scrollTop: this.root.scrollTop, height: this.root.clientHeight };
        if (reveal) {
            const top =
                this.layout.paddingTop +
                Math.floor(index / this.layout.columns) * (this.layout.rowHeight + this.layout.rowGap);
            if (top < viewport.scrollTop) viewport.scrollTop = top;
            else if (top + this.layout.rowHeight > viewport.scrollTop + viewport.height)
                viewport.scrollTop = top + this.layout.rowHeight - viewport.height;
        }
        this.renderWindow(index, viewport);
        if (reveal) this.root.scrollTop = viewport.scrollTop;
        this.bookCards.get(summary.book.id)?.root.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
        this.position = this.capturePosition(viewport.scrollTop);
    }

    /**
     * 空态和页面销毁释放所有离窗引用；布局监听仍由页面生命周期统一结束。
     */
    private clearWindow(): void {
        if (this.frame !== undefined) cancelAnimationFrame(this.frame);
        this.frame = undefined;
        if (this.observedBook) this.resizeObserver?.unobserve(this.observedBook);
        this.observedBook = undefined;
        this.bookCards.clear();
        this.rows.clear();
        this.books = [];
        this.bookIndexes.clear();
        this.windowElement.replaceChildren();
        this.position = null;
        delete this.root.dataset["windowed"];
        this.root.removeAttribute("role");
    }

    /**
     * 阅读与分类直接可达，文件操作就地展开；分类选择完成即保存，失败时恢复原值。
     * @param handlers - move 返回 false 或抛错时恢复分类选择器原值
     */
    public bindEvents(
        handlers: {
            read: (id: string) => void;
            delete: (id: string) => Promise<void>;
            move: (id: string, categoryId: string) => Promise<boolean>;
            export: (id: string) => Promise<void>;
            import: () => void;
            retry: () => Promise<void>;
        },
        signal: AbortSignal
    ): void {
        this.resizeObserver = new ResizeObserver(() => {
            run(() => {
                this.updateLayout(this.position);
            });
        });
        this.resizeObserver.observe(this.root);
        bind(
            this.root,
            "scroll",
            () => {
                this.position = this.capturePosition();
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
                this.resizeObserver?.disconnect();
                if (this.frame !== undefined) cancelAnimationFrame(this.frame);
                this.frame = undefined;
                this.bookCards.clear();
                this.rows.clear();
                this.operatingBooks.clear();
            },
            { once: true }
        );

        // 原生 Tab 在书卡内部流动，跨书籍时按完整结果衔接，避免受 DOM 窗口边缘限制。
        bind(
            this.root,
            "keydown",
            (event: KeyboardEvent) => {
                if (
                    event.key !== "Tab" ||
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    !(event.target instanceof HTMLElement)
                )
                    return;
                const id = event.target.closest<HTMLElement>(".book")?.dataset["id"];
                const index = id ? this.bookIndexes.get(id) : undefined;
                if (index === undefined) return;
                if (
                    !event.shiftKey &&
                    event.target instanceof HTMLButtonElement &&
                    event.target.matches(".book-more") &&
                    event.target.popoverTargetElement?.matches(":popover-open")
                )
                    return;
                const direction =
                    event.shiftKey && event.target.matches(".book-open")
                        ? -1
                        : !event.shiftKey && event.target.matches(".book-more")
                          ? 1
                          : 0;
                if (!direction || !this.books[index + direction]) return;
                event.preventDefault();
                this.focusBook(index + direction, direction > 0 ? ".book-open" : ".book-more", true);
            },
            { signal }
        );

        // 空态和顶部入口请求同一个导入流程，不查找或触发其他区域的按钮。
        delegate(this.root, ".shelf-empty-import", "click", handlers.import, { signal });
        delegate(this.root, ".shelf-retry", "click", handlers.retry, { signal });

        // 原生 popover 负责外部点击、Escape 与焦点顺序，只补充靠近书目的定位。
        bind(
            this.root,
            "beforetoggle",
            (event: ToggleEvent) => {
                if (
                    event.newState === "open" &&
                    event.target instanceof HTMLElement &&
                    event.target.classList.contains("book-file-actions")
                )
                    this.positionFileActions(event.target);
            },
            { signal, capture: true }
        );
        bind(
            this.root,
            "toggle",
            (event: ToggleEvent) => {
                if (
                    event.newState === "open" &&
                    event.target instanceof HTMLElement &&
                    event.target.classList.contains("book-file-actions")
                )
                    event.target.scrollTop = 0;
            },
            { signal, capture: true }
        );
        const closeFileActions = () => {
            for (const actions of this.root.querySelectorAll<HTMLElement>(".book-file-actions:popover-open"))
                actions.hidePopover();
        };
        this.root.addEventListener("scroll", closeFileActions, { signal });
        window.addEventListener("resize", closeFileActions, { signal });
        window.visualViewport?.addEventListener("resize", closeFileActions, { signal });
        window.visualViewport?.addEventListener("scroll", closeFileActions, { signal });
        signal.addEventListener("abort", closeFileActions, { once: true });

        delegate(
            this.root,
            ".book-export",
            "click",
            async (_, button) => {
                const owner = this.closeFileActions(button);
                const id = assertExists(owner.dataset["id"]);
                this.operatingBooks.add(id);
                try {
                    await handlers.export(id);
                } finally {
                    this.operatingBooks.delete(id);
                    if (!signal.aborted) this.scheduleWindow();
                }
            },
            { signal }
        );

        // 阅读委托给整块书封，避免标题子节点影响书籍定位。
        delegate(
            this.root,
            ".book-open",
            "click",
            (_, button) => {
                handlers.read(assertExists(button.closest<HTMLElement>(".book")?.dataset["id"]));
            },
            { signal }
        );

        // 删除完成且原控件已移除时，将焦点交给相邻书目。
        delegate(
            this.root,
            ".book-delete",
            "click",
            async (_, button) => {
                const owner = this.closeFileActions(button);
                const id = assertExists(owner.dataset["id"]);
                const index = this.bookIndexes.get(id) ?? 0;
                this.operatingBooks.add(id);
                try {
                    await handlers.delete(id);
                } finally {
                    this.operatingBooks.delete(id);
                    // 刷新后的反馈失败也不能把焦点留给已经移除的控件。
                    if (!signal.aborted && !owner.isConnected && document.activeElement === document.body) {
                        this.focusBook(Math.min(index, this.books.length - 1), ".book-open", false);
                    }
                    if (!signal.aborted) this.scheduleWindow();
                }
            },
            { signal }
        );

        // 分类选择即时提交；保存期间禁用该选择器，失败则回滚显示值。
        delegate(
            this.root,
            ".book-category",
            "change",
            async (_, element) => {
                if (!(element instanceof HTMLSelectElement) || element.disabled) return;
                const previous = assertExists(element.dataset["categoryId"]);
                const next = element.value;
                if (previous === next) return;

                // 选择器禁用后可能失焦，接续由本次分类操作负责，不交给列表渲染猜测来源。
                const id = assertExists(element.closest<HTMLElement>(".book")?.dataset["id"]);
                const index = this.bookIndexes.get(id) ?? 0;
                const hadFocus = element.contains(document.activeElement);
                this.operatingBooks.add(id);
                element.disabled = true;
                element.setAttribute("aria-busy", "true");

                try {
                    if (await handlers.move(id, next)) element.dataset["categoryId"] = next;
                    else element.value = previous;
                } catch (error) {
                    element.value = previous;
                    throw error;
                } finally {
                    // 仅在控件仍存在且用户未移走焦点时恢复焦点。
                    this.operatingBooks.delete(id);
                    element.disabled = false;
                    element.removeAttribute("aria-busy");
                    if (!signal.aborted && hadFocus && document.activeElement === document.body) {
                        if (element.isConnected) element.focus({ preventScroll: true });
                        else this.focusBook(Math.min(index, this.books.length - 1), ".book-open", false);
                    }
                    if (!signal.aborted) this.scheduleWindow();
                }
            },
            { signal }
        );
    }

    /**
     * 空书架和分类提供直接导入入口；搜索无结果只提示调整查询。
     */
    private createEmptyState(state: BookListEmptyState): HTMLElement {
        const searching = state === "search";
        const empty = document.createElement("div");
        empty.className = "shelf-empty";
        empty.classList.toggle("shelf-empty-search", searching);

        const illustration = searching ? document.createElement("div") : this.createShelfIllustration();
        if (searching) {
            illustration.className = "icon icon-search";
            illustration.setAttribute("aria-hidden", "true");
        }

        const title = document.createElement("h2");
        title.textContent = searching ? "没有找到这本书" : state === "category" ? "这个分类还没有书" : "从一本书开始";
        const hint = document.createElement("p");
        hint.className = "shelf-empty-hint";
        hint.textContent = searching ? "试试其他书名，或清除搜索。" : "导入 TXT 或 EPUB，把喜欢的书留在手边。";
        empty.append(illustration, title, hint);
        if (searching) return empty;

        const importButton = document.createElement("button");
        importButton.type = "button";
        importButton.className = "shelf-empty-import";
        const importIcon = document.createElement("span");
        importIcon.className = "icon icon-add";
        importIcon.setAttribute("aria-hidden", "true");
        const importLabel = document.createElement("span");
        importLabel.textContent = "导入书籍";
        importButton.append(importIcon, importLabel);

        const note = document.createElement("p");
        note.className = "shelf-empty-note";
        note.textContent = "本地保存 · 无需账户";
        empty.append(importButton, note);
        return empty;
    }

    /**
     * 加载与空态共用主题协调的书籍插画，装饰不参与辅助技术朗读。
     */
    private createShelfIllustration(): HTMLElement {
        const illustration = document.createElement("div");
        illustration.className = "shelf-illustration";
        illustration.setAttribute("aria-hidden", "true");
        for (const color of ["mint", "peach", "blue"]) {
            const book = document.createElement("span");
            book.className = `illustration-book illustration-book-${color}`;
            illustration.append(book);
        }
        return illustration;
    }

    /**
     * 文件菜单贴近入口展开，靠近窗口边缘时调整方向并保留内部滚动空间。
     */
    private positionFileActions(actions: HTMLElement): void {
        const owner = assertExists(actions.closest<HTMLElement>(".book"));
        const ownerLeft = owner.getBoundingClientRect().left;
        const button = assertExists(owner.querySelector<HTMLElement>(".book-more")).getBoundingClientRect();
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft ?? 0;
        const top = viewport?.offsetTop ?? 0;
        const width = viewport?.width ?? document.documentElement.clientWidth;
        const height = viewport?.height ?? window.innerHeight;
        const below = top + height - button.bottom - 8;
        const above = button.top - top - 8;
        const opensAbove = below < 112 && above > below;

        actions.style.width = `${Math.min(184, width - 16)}px`;
        actions.style.left = `${Math.max(left + 8, Math.min(ownerLeft, left + width - 192))}px`;
        actions.style.top = opensAbove ? "auto" : `${button.bottom + 4}px`;
        actions.style.bottom = opensAbove ? `${window.innerHeight - button.top + 4}px` : "auto";
        actions.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`;
    }

    /**
     * 打开确认或导出前归还到可见入口，避免操作结束后焦点停留在隐藏的菜单项。
     */
    private closeFileActions(button: HTMLElement): HTMLElement {
        const owner = assertExists(button.closest<HTMLElement>(".book"));
        const actions = assertExists(owner.querySelector<HTMLElement>(".book-file-actions"));
        const focusedInside = actions.contains(document.activeElement);
        actions.hidePopover();
        // 部分浏览器关闭 popover 后仍暂留菜单焦点，只为这个原生缺口接续可见入口。
        const entry = assertExists(owner.querySelector<HTMLElement>(".book-more"));
        if (focusedInside && document.activeElement !== entry) entry.focus({ preventScroll: true });
        return owner;
    }
}
