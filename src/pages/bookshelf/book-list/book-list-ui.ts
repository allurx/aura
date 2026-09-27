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

import EventUtil from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import Ui from "@/components/ui";
import type Category from "@/domain/category/category";
import type { BookSummary } from "../bookshelf-service";

/**
 * 渲染书籍摘要，并管理阅读、分类移动与删除操作后的焦点。
 * @author allurx
 */
export default class BookListUi extends Ui {
    public readonly scrollContainer: HTMLElement;
    // 原生选择器禁用后可能失焦，保留来源供列表重渲染时恢复焦点。
    private pendingSelection: HTMLSelectElement | null = null;

    /**
     * 外观只作用于书籍网格，滚动位置属于同时容纳导入反馈的内容区。
     */
    public constructor(args: ConstructorParameters<typeof Ui>[0] & { scrollContainer: HTMLElement }) {
        super(args);
        this.scrollContainer = args.scrollContainer;
    }

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
     * @param searching - 是否存在有效查询，用于区分空书架与无搜索结果
     */
    public renderBooks(books: BookSummary[], categories: Category[], searching: boolean): void {
        // 替换 DOM 前记录操作来源，禁用的分类选择器也参与焦点恢复。
        const scrollTop = this.scrollContainer.scrollTop;
        const active = document.activeElement === document.body ? this.pendingSelection : document.activeElement;
        const focused = active instanceof HTMLOptionElement ? active.closest("select") : active;
        const owner = focused instanceof HTMLElement ? focused.closest<HTMLElement>(".book") : null;
        const focusId = owner?.dataset["id"];
        const focusClass = focused instanceof HTMLSelectElement ? ".book-category" : ".book-open";
        const previousIndex = owner ? Array.from(this.root.children).indexOf(owner) : -1;

        // 空态区分无藏书与无搜索结果，给出对应的下一步提示。
        if (books.length === 0) {
            const empty = document.createElement("div");
            empty.className = "shelf-empty";

            // 图标只作装饰，标题与提示承担可读信息。
            const symbol = document.createElement("span");
            symbol.className = "icon icon-book";
            symbol.setAttribute("aria-hidden", "true");

            const title = document.createElement("h2");
            title.textContent = searching ? "没有找到这本书" : "给书架添一本书吧";
            const hint = document.createElement("p");
            hint.textContent = searching ? "试试其他书名，或清除搜索。" : "导入一本 TXT，让故事从这里开始。";

            empty.append(symbol, title, hint);
            this.root.replaceChildren(empty);
        } else {
            // 先在片段中生成全部书目，再一次替换当前结果。
            const fragment = document.createDocumentFragment();
            const sortedCategories = categories.toSorted((a, b) => a.order - b.order);
            for (const book of books) fragment.append(this.createBookElement(book, sortedCategories));
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
        }

        this.scrollContainer.scrollTop = scrollTop;
    }

    /**
     * 阅读与删除直接可达；分类选择完成即保存，失败时恢复原值。
     * @param onMove - 返回是否接受目标分类；返回 false 或抛错时恢复选择器原值
     */
    public bindEvents(
        onRead: (id: string) => void,
        onDelete: (id: string) => Promise<void>,
        onMove: (id: string, categoryId: string) => Promise<boolean>,
        signal: AbortSignal
    ): void {
        // 阅读委托给整块书封，避免标题子节点影响书籍定位。
        EventUtil.delegate(
            this.root,
            ".book-open",
            "click",
            (_, button) => {
                onRead(assertExists(button.closest<HTMLElement>(".book")?.dataset["id"]));
            },
            { signal }
        );

        // 删除完成且原控件已移除时，将焦点交给相邻书目。
        EventUtil.delegate(
            this.root,
            ".book-delete",
            "click",
            async (_, button) => {
                const owner = assertExists(button.closest<HTMLElement>(".book"));
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
        EventUtil.delegate(
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
     * 将稳定书籍标识映射到完整色相环，分类与筛选不会改变书封。
     */
    private coverHue(bookId: string): number {
        let hash = 0;
        for (const character of bookId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        return hash % 360;
    }

    /**
     * 全书名使用文本和无障碍名称，视觉书封保持有限行数。
     * @param categories - 已按展示顺序排列的可选分类
     */
    private createBookElement(summary: BookSummary, categories: Category[]): HTMLElement {
        // 书目容器携带稳定 ID，供事件委托和重渲染后的焦点定位。
        const book = document.createElement("article");
        book.className = "book";
        book.dataset["id"] = summary.book.id;
        book.style.setProperty("--book-cover-hue", String(this.coverHue(summary.book.id)));

        // 书封作为阅读入口，完整书名与进度同时提供给辅助技术。
        const open = document.createElement("button");
        open.type = "button";
        open.className = "book-open";
        open.title = summary.title;
        open.setAttribute("aria-label", `阅读《${summary.title}》，${summary.progress}`);
        const title = document.createElement("span");
        title.className = "book-title";
        title.textContent = summary.title;
        open.append(title);

        // 书封外显示已保存位置，便于快速接续阅读。
        const progress = document.createElement("p");
        progress.className = "book-progress";
        progress.textContent = summary.progress;

        // 分类选择与删除共用操作区，选项值保留持久化分类 ID。
        const tools = document.createElement("div");
        tools.className = "book-tools";
        const categorySelect = document.createElement("select");
        categorySelect.className = "book-category";
        categorySelect.dataset["categoryId"] = summary.book.categoryId;
        categorySelect.setAttribute("aria-label", `移动《${summary.title}》到分类`);
        categorySelect.title = "选择分类即可移动";
        for (const category of categories) {
            const option = document.createElement("option");
            option.value = category.id;
            option.textContent = category.name;
            categorySelect.append(option);
        }
        categorySelect.value = summary.book.categoryId;

        // 删除入口独立于阅读按钮，装饰图标不重复朗读书名。
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "book-delete icon-button";
        remove.setAttribute("aria-label", `删除《${summary.title}》`);
        remove.title = "删除书籍";
        const icon = document.createElement("span");
        icon.className = "icon icon-delete";
        icon.setAttribute("aria-hidden", "true");
        remove.append(icon);

        // 按阅读、进度和就近操作的顺序组装书目。
        tools.append(categorySelect, remove);
        book.append(open, progress, tools);
        return book;
    }
}
