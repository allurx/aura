/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind, delegate } from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import Ui from "@/components/ui";
import { CATEGORIES } from "@/domain/category/category";
import type { BookSummary } from "../bookshelf-service";

/**
 * 控制器按完整书架和当前筛选区分空态，列表不自行推断领域状态。
 */
export type BookListEmptyState = "library" | "category" | "search";

/**
 * 渲染书籍摘要，并管理阅读、分类移动与删除操作后的焦点。
 */
export default class BookListUi extends Ui {
    // 原生选择器禁用后可能失焦，保留来源供列表重渲染时恢复焦点。
    private pendingSelection: HTMLSelectElement | null = null;

    /**
     * 返回时恢复仍在当前列表中的书籍；加载期间用户已移走焦点则保持原处。
     */
    public restoreBookFocus(bookId: string): void {
        if (!bookId || document.activeElement !== document.body) return;
        const book = Array.from(this.root.querySelectorAll<HTMLElement>(".book")).find(
            (element) => element.dataset["id"] === bookId
        );
        book?.querySelector<HTMLButtonElement>(".book-open")?.focus({ preventScroll: true });
    }

    /**
     * 更新筛选结果，并保留还在书架中的操作焦点及滚动位置。
     * @param emptyState - 没有结果时展示的书架、分类或搜索提示。
     */
    public renderBooks(books: BookSummary[], emptyState: BookListEmptyState): void {
        // 替换 DOM 前记录操作来源，禁用的分类选择器也参与焦点恢复。
        const scrollTop = this.root.scrollTop;
        const active = document.activeElement === document.body ? this.pendingSelection : document.activeElement;
        const focused = active instanceof HTMLOptionElement ? active.closest("select") : active;
        const focusedInside = focused instanceof HTMLElement && this.root.contains(focused);
        const owner = focused instanceof HTMLElement ? focused.closest<HTMLElement>(".book") : null;
        const focusId = owner?.dataset["id"];
        const focusClass = focused instanceof HTMLSelectElement ? ".book-category" : ".book-open";
        const previousIndex = owner ? Array.from(this.root.children).indexOf(owner) : -1;

        // 空态区分无藏书与无搜索结果，给出对应的下一步提示。
        if (books.length === 0) {
            this.root.replaceChildren(this.createEmptyState(emptyState));
        } else {
            // 先在片段中生成全部书目，再一次替换当前结果。
            const fragment = document.createDocumentFragment();
            for (const book of books) fragment.append(this.createBookElement(book));
            this.root.replaceChildren(fragment);
        }

        // 优先恢复同书目的原操作，已移出结果时再回退到相邻书目或列表。
        if (focusId && !this.root.contains(owner)) {
            const cards = Array.from(this.root.querySelectorAll<HTMLElement>(".book"));
            const replacement = cards.find((card) => card.dataset["id"] === focusId);
            const next =
                replacement?.querySelector<HTMLElement>(focusClass) ??
                cards[Math.min(previousIndex, cards.length - 1)]?.querySelector<HTMLElement>(".book-open");
            (next ?? this.root).focus({ preventScroll: true });
        } else if (focusedInside && !this.root.contains(focused)) {
            // 列表刷新也可能替换空态入口，失败后的重读同样保留可继续操作的焦点。
            const next =
                this.root.querySelector<HTMLElement>(".book-open") ??
                this.root.querySelector<HTMLElement>(".shelf-empty-import");
            (next ?? this.root).focus({ preventScroll: true });
        }

        this.root.scrollTop = scrollTop;
    }

    /**
     * 阅读与分类直接可达，文件操作就地展开；分类选择完成即保存，失败时恢复原值。
     * @param onMove - 返回是否接受目标分类；返回 false 或抛错时恢复选择器原值
     */
    public bindEvents(
        onRead: (id: string) => void,
        onDelete: (id: string) => Promise<void>,
        onMove: (id: string, categoryId: string) => Promise<boolean>,
        onExport: (id: string) => Promise<void>,
        onImportRequest: () => void,
        signal: AbortSignal
    ): void {
        // 空态和顶部入口请求同一个导入流程，不查找或触发其他区域的按钮。
        delegate(this.root, ".shelf-empty-import", "click", onImportRequest, { signal });

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
        const closeFileActions = () => {
            for (const actions of this.root.querySelectorAll<HTMLElement>(".book-file-actions:popover-open"))
                actions.hidePopover();
        };
        this.root.addEventListener("scroll", closeFileActions, { signal });
        window.addEventListener("resize", closeFileActions, { signal });
        window.visualViewport?.addEventListener("resize", closeFileActions, { signal });
        signal.addEventListener("abort", closeFileActions, { once: true });

        delegate(
            this.root,
            ".book-export",
            "click",
            (_, button) => {
                const owner = this.closeFileActions(button);
                return onExport(assertExists(owner.dataset["id"]));
            },
            { signal }
        );

        // 阅读委托给整块书封，避免标题子节点影响书籍定位。
        delegate(
            this.root,
            ".book-open",
            "click",
            (_, button) => {
                onRead(assertExists(button.closest<HTMLElement>(".book")?.dataset["id"]));
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
                const index = Array.from(this.root.children).indexOf(owner);
                await onDelete(assertExists(owner.dataset["id"]));

                if (!signal.aborted && !owner.isConnected && document.activeElement === document.body) {
                    const cards = this.root.querySelectorAll<HTMLElement>(".book");
                    const next = cards[Math.min(index, cards.length - 1)]?.querySelector<HTMLElement>(".book-open");
                    (next ?? this.root).focus({ preventScroll: true });
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
                if (element.contains(document.activeElement)) this.pendingSelection = element;
                element.disabled = true;
                element.setAttribute("aria-busy", "true");

                try {
                    if (await onMove(id, next)) element.dataset["categoryId"] = next;
                    else element.value = previous;
                } catch (error) {
                    element.value = previous;
                    throw error;
                } finally {
                    // 仅在控件仍存在且用户未移走焦点时恢复焦点。
                    element.disabled = false;
                    element.removeAttribute("aria-busy");
                    if (this.pendingSelection === element) {
                        this.pendingSelection = null;
                        if (!signal.aborted && element.isConnected && document.activeElement === document.body)
                            element.focus({ preventScroll: true });
                    }
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

        // 插画由主题协调的书封、书脊和页边构成，不作为可交互控件。
        const illustration = document.createElement("div");
        illustration.className = searching ? "icon icon-search" : "shelf-empty-illustration";
        illustration.setAttribute("aria-hidden", "true");
        if (!searching) {
            for (const color of ["mint", "peach", "blue"]) {
                const book = document.createElement("span");
                book.className = `empty-book empty-book-${color}`;
                illustration.append(book);
            }
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
