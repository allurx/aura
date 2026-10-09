/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind, delegate, run } from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import Ui from "@/components/ui";
import { CATEGORIES } from "@/domain/category/category";
import type { BookSummary } from "../bookshelf-service";

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
    private readonly bookElements = new Map<string, { summary: BookSummary; element: HTMLElement }>();
    private readonly rows = new Map<number, HTMLElement>();
    private readonly windowElement = document.createElement("div");
    private readonly operatingBooks = new Set<string>();
    private layout = { columns: 1, rowHeight: 0, rowGap: 0, paddingTop: 0 };
    private position: BookListPosition | null = null;
    private resizeObserver: ResizeObserver | undefined;
    private observedBook: HTMLElement | undefined;
    private frame: number | undefined;
    // 原生选择器禁用后可能失焦，保留来源供列表重渲染时恢复焦点。
    private pendingSelection: HTMLSelectElement | null = null;

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
     * 导入替换空态入口后接续到书目；全部拒绝时仍可重新导入，不夺走用户已移动的焦点。
     */
    public restoreImportFocus(): void {
        if (document.activeElement !== document.body) return;
        const target = this.root.querySelector<HTMLElement>(".book-open, .shelf-empty-import") ?? this.root;
        target.focus({ preventScroll: true });
    }

    /**
     * 保留可见行中的同一书籍锚点，避免连续换列时逐次改选行首而向前漂移。
     */
    public capturePosition(): BookListPosition | null {
        if (!this.books.length || !this.layout.rowHeight) return null;
        const top = this.root.scrollTop - this.layout.paddingTop;
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
        const active = document.activeElement === document.body ? this.pendingSelection : document.activeElement;
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
            this.updateLayout(nextAnchor);
        }

        if (focusId && document.activeElement !== focused) {
            const index = this.bookIndexes.get(focusId);
            this.focusBook(
                index ?? Math.min(previousIndex ?? 0, books.length - 1),
                index === undefined ? ".book-open" : focusClass,
                false
            );
        } else if (focusedInside && !this.root.contains(focused)) {
            (this.root.querySelector<HTMLElement>(".book-open, .shelf-empty-import") ?? this.root).focus({
                preventScroll: true,
            });
        }
    }

    /**
     * 一张实际书卡提供共同尺寸，CSS Grid 决定列数；滚动条出现后再核对一次。
     */
    private updateLayout(position: BookListPosition | null): void {
        if (!this.books.length || !this.root.clientWidth) return;
        this.position = position;
        if (this.windowElement.parentElement !== this.root) {
            this.root.dataset["windowed"] = "true";
            this.root.setAttribute("role", "list");
            this.root.replaceChildren(this.windowElement);
        }

        let sample = this.bookElements.values().next().value?.element;
        if (!sample) {
            const summary = assertExists(this.books[0]);
            sample = this.createBookElement(summary);
            this.bookElements.set(summary.book.id, { summary, element: sample });
            this.getRow(0).append(sample);
        }
        const row = assertExists(sample.parentElement);
        const listStyle = getComputedStyle(this.root);
        for (let pass = 0; pass < 2; pass++) {
            this.layout = {
                columns: getComputedStyle(row).gridTemplateColumns.split(/\s+/u).length,
                rowHeight: sample.getBoundingClientRect().height,
                rowGap: Number.parseFloat(listStyle.rowGap),
                paddingTop: Number.parseFloat(listStyle.paddingTop),
            };
            const count = Math.ceil(this.books.length / this.layout.columns);
            this.windowElement.style.height = `${String(count * this.layout.rowHeight + (count - 1) * this.layout.rowGap)}px`;
        }

        const index = position ? (this.bookIndexes.get(position.bookId) ?? 0) : 0;
        const offset = position
            ? Math.min(position.offset, this.layout.rowHeight + this.layout.rowGap - 1)
            : -this.layout.paddingTop;
        this.root.scrollTop =
            this.layout.paddingTop +
            Math.floor(index / this.layout.columns) * (this.layout.rowHeight + this.layout.rowGap) +
            offset;
        this.renderWindow();
        this.position = this.capturePosition();
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
    private renderWindow(extraIndex?: number): void {
        if (!this.books.length || !this.layout.rowHeight) return;
        const { columns, rowHeight, rowGap, paddingTop } = this.layout;
        const step = rowHeight + rowGap;
        const first = Math.max(0, Math.floor((this.root.scrollTop - paddingTop) / step) - 2);
        const last = Math.min(
            Math.ceil(this.books.length / columns),
            Math.ceil((this.root.scrollTop + this.root.clientHeight - paddingTop) / step) + 2
        );
        const wantedRows = new Set<number>();
        for (let row = first; row < last; row++) wantedRows.add(row);
        if (extraIndex !== undefined) wantedRows.add(Math.floor(extraIndex / columns));

        const active = document.activeElement;
        const focused = active instanceof HTMLOptionElement ? active.closest("select") : active;
        const focusedInside = focused instanceof HTMLElement && this.root.contains(focused);
        const pinnedIds = new Set(this.operatingBooks);
        for (const element of [
            focused,
            this.pendingSelection,
            ...this.root.querySelectorAll(".book-file-actions:popover-open"),
        ]) {
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
                let entry = this.bookElements.get(id);
                if (entry?.summary !== summary) {
                    entry?.element.remove();
                    entry = { summary, element: this.createBookElement(summary) };
                    this.bookElements.set(id, entry);
                }
                entry.element.setAttribute("aria-posinset", String(item + 1));
                entry.element.setAttribute("aria-setsize", String(this.books.length));
                elements.push(entry.element);
            }
            const desired = new Set<Element>(elements);
            for (const child of Array.from(row.children)) {
                if (!desired.has(child)) child.remove();
            }
            let cursor = row.firstElementChild;
            for (const element of elements) {
                if (element === cursor) cursor = cursor.nextElementSibling;
                else row.insertBefore(element, cursor);
            }
        }
        for (const [index, row] of this.rows) {
            if (!wantedRows.has(index)) {
                row.remove();
                this.rows.delete(index);
            }
        }
        for (const [id, entry] of this.bookElements) {
            if (!wantedBooks.has(id)) {
                entry.element.remove();
                this.bookElements.delete(id);
            }
        }
        let cursor = this.windowElement.firstElementChild;
        for (const index of orderedRows) {
            const row = assertExists(this.rows.get(index));
            if (row === cursor) cursor = cursor.nextElementSibling;
            else this.windowElement.insertBefore(row, cursor);
        }

        // 网格换列可能移动同一控件，恢复其原生焦点，不改变浏览位置。
        if (focusedInside && focused.isConnected && document.activeElement === document.body)
            focused.focus({ preventScroll: true });
        const sample = this.bookElements.values().next().value?.element;
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
                this.renderWindow();
                this.position = this.capturePosition();
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
        if (reveal) {
            const top =
                this.layout.paddingTop +
                Math.floor(index / this.layout.columns) * (this.layout.rowHeight + this.layout.rowGap);
            if (top < this.root.scrollTop) this.root.scrollTop = top;
            else if (top + this.layout.rowHeight > this.root.scrollTop + this.root.clientHeight)
                this.root.scrollTop = top + this.layout.rowHeight - this.root.clientHeight;
        }
        this.renderWindow(index);
        this.bookElements
            .get(summary.book.id)
            ?.element.querySelector<HTMLElement>(selector)
            ?.focus({ preventScroll: true });
        this.position = this.capturePosition();
    }

    /**
     * 空态和页面销毁释放所有离窗引用；布局监听仍由页面生命周期统一结束。
     */
    private clearWindow(): void {
        if (this.frame !== undefined) cancelAnimationFrame(this.frame);
        this.frame = undefined;
        if (this.observedBook) this.resizeObserver?.unobserve(this.observedBook);
        this.observedBook = undefined;
        this.bookElements.clear();
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
                this.bookElements.clear();
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

                // 定制原生 picker 的焦点可能落在 option，禁用前一并保存来源。
                const id = assertExists(element.closest<HTMLElement>(".book")?.dataset["id"]);
                this.operatingBooks.add(id);
                if (element.contains(document.activeElement)) this.pendingSelection = element;
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
                    if (this.pendingSelection === element) {
                        this.pendingSelection = null;
                        if (!signal.aborted && element.isConnected && document.activeElement === document.body)
                            element.focus({ preventScroll: true });
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
        actions.style.left = `${Math.max(left + 8, Math.min(owner.getBoundingClientRect().left, left + width - 192))}px`;
        actions.style.top = opensAbove ? "auto" : `${button.bottom + 4}px`;
        actions.style.bottom = opensAbove ? `${window.innerHeight - button.top + 4}px` : "auto";
        actions.style.maxHeight = `${Math.max(0, opensAbove ? above : below)}px`;
    }

    /**
     * 打开确认或导出前归还到可见入口，避免操作结束后焦点停留在隐藏的菜单项。
     */
    private closeFileActions(button: HTMLElement): HTMLElement {
        const owner = assertExists(button.closest<HTMLElement>(".book"));
        assertExists(owner.querySelector<HTMLElement>(".book-file-actions")).hidePopover();
        assertExists(owner.querySelector<HTMLElement>(".book-more")).focus({ preventScroll: true });
        return owner;
    }

    /**
     * 将稳定书籍标识映射到完整色相环，分类与筛选不会改变书封。
     */
    private coverHue(bookId: string): number {
        let hash = 0;
        for (const character of bookId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        return hash % 360;
    }

    /**
     * 全书名使用文本和无障碍名称，视觉书封保持有限行数。
     */
    private createBookElement(summary: BookSummary): HTMLElement {
        // 书目容器携带稳定 ID，供事件委托和重渲染后的焦点定位。
        const book = document.createElement("article");
        book.className = "book";
        book.setAttribute("role", "listitem");
        book.dataset["id"] = summary.book.id;
        book.style.setProperty("--book-cover-hue", String(this.coverHue(summary.book.id)));

        // 书封作为阅读入口，完整书名与进度同时提供给辅助技术。
        const open = document.createElement("button");
        open.type = "button";
        open.className = "book-open";
        open.title = summary.book.fileName;
        const progressLabel = summary.progress
            ? `第 ${String(summary.progress.chapterNumber)} / ${String(summary.progress.chapterCount)} 章`
            : "暂无阅读位置";
        open.setAttribute("aria-label", `阅读《${summary.title}》，${progressLabel}`);
        const title = document.createElement("span");
        title.className = "book-title";
        title.textContent = summary.title;
        const cover = document.createElement("span");
        cover.className = "book-cover";
        cover.append(title);
        open.append(cover);

        // 书封外显示已保存位置，便于快速接续阅读。
        const details = document.createElement("div");
        details.className = "book-details";
        const progress = document.createElement("p");
        progress.className = "book-progress";
        progress.textContent = summary.progress
            ? `${String(summary.progress.chapterNumber)}/${String(summary.progress.chapterCount)}`
            : "暂无进度";
        progress.title = progressLabel;

        // 分类与更多操作共用一行，选项值保留持久化分类 ID。
        const categorySelect = document.createElement("select");
        categorySelect.className = "book-category";
        categorySelect.id = `book-category-${summary.book.id}`;
        categorySelect.dataset["categoryId"] = summary.book.categoryId;
        categorySelect.setAttribute("aria-label", `移动《${summary.title}》到分类`);
        for (const category of CATEGORIES) {
            const option = document.createElement("option");
            option.value = category.id;
            option.textContent = category.name;
            categorySelect.append(option);
        }
        categorySelect.value = summary.book.categoryId;
        categorySelect.title = `当前分类：${categorySelect.selectedOptions[0]?.textContent ?? ""}。选择分类即可移动`;

        // 分类名称只展示归属；独立的原生选择器在箭头区域承载点击和键盘操作。
        const categoryLabel = document.createElement("span");
        categoryLabel.className = "book-category-label";
        categoryLabel.textContent = categorySelect.selectedOptions[0]?.textContent ?? "";
        categoryLabel.title = categoryLabel.textContent;
        const categoryIcon = document.createElement("span");
        categoryIcon.className = "book-category-icon";
        categoryIcon.setAttribute("aria-hidden", "true");
        const chevron = document.createElement("span");
        chevron.className = "icon icon-chevron";
        categoryIcon.append(chevron);

        // 删除入口独立于阅读按钮，装饰图标不重复朗读书名。
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "book-delete book-action";
        remove.setAttribute("aria-label", `删除《${summary.title}》`);
        remove.title = "删除书籍";
        const icon = document.createElement("span");
        icon.className = "icon icon-delete";
        icon.setAttribute("aria-hidden", "true");
        const removeLabel = document.createElement("span");
        removeLabel.textContent = "删除";
        remove.append(icon, removeLabel);

        const exportButton = document.createElement("button");
        exportButton.type = "button";
        exportButton.className = "book-export book-action";
        exportButton.title = "导出原文件";
        exportButton.setAttribute("aria-label", `导出《${summary.title}》原文件`);
        const exportIcon = document.createElement("span");
        exportIcon.className = "icon icon-download";
        exportIcon.setAttribute("aria-hidden", "true");
        const exportLabel = document.createElement("span");
        exportLabel.textContent = "导出";
        exportButton.append(exportIcon, exportLabel);

        const actions = document.createElement("div");
        actions.id = `book-actions-${summary.book.id}`;
        actions.className = "book-file-actions panel-scroll";
        actions.popover = "auto";
        actions.setAttribute("role", "group");
        actions.setAttribute("aria-label", `《${summary.title}》的文件操作`);
        exportButton.autofocus = true;
        actions.append(exportButton, remove);

        const more = document.createElement("button");
        more.type = "button";
        more.className = "book-more icon-button";
        more.popoverTargetElement = actions;
        more.setAttribute("aria-label", `《${summary.title}》的更多操作`);
        more.title = "更多操作";
        const moreIcon = document.createElement("span");
        moreIcon.className = "icon icon-more";
        moreIcon.setAttribute("aria-hidden", "true");
        more.append(moreIcon);

        // 按阅读、进度和就近操作的顺序组装书目。
        details.append(progress, categoryLabel, categorySelect, categoryIcon, more, actions);
        book.append(open, details);
        return book;
    }
}
