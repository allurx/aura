/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import HeaderUi from "./header/header-ui";
import NavUi from "./nav/nav-ui";
import BookListUi, { type BookListEmptyState } from "./book-list/book-list-ui";
import BookshelfUi from "./bookshelf-ui";
import {
    BookImportError,
    clearBookshelf,
    deleteBook,
    getBookSummaries,
    getBookExport,
    importBooks,
    moveBook,
    type BookImportResult,
    type BookSummary,
} from "./bookshelf-service";
import { bookshelfSession } from "./bookshelf-state";
import { resetData } from "./reset-data";
import { DEFAULT_CATEGORY_ID, getCategory } from "@/domain/category/category";
import { bind } from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import { createBookshelfSettings } from "@/settings/definitions/setting-catalog";
import SettingController from "@/settings/setting-controller";
import { PageName } from "@/constants/page-name";
import OperationError from "@/errors/operation-error";
import { BOOK_FILE_ACCEPT } from "@/domain/file/book-format";
import { createErrorContent } from "@/components/dialog/error-content";

/**
 * 编排书架筛选、数据操作与页面外观，并在异步渲染前核对页面生命周期。
 */
export default class BookshelfController {
    private readonly headerUi: HeaderUi;
    private readonly navUi: NavUi;
    private readonly bookListUi: BookListUi;
    private readonly bookshelfUi: BookshelfUi;
    private readonly settingController: SettingController;
    private signal!: AbortSignal;
    // null 表示摘要尚未读取成功，不能将其当作空书架。
    private books: BookSummary[] | null = null;
    private refreshVersion = 0;
    // 等待确认对话框期间也保持互斥，避免重复确认或并行写入。
    private busy = false;

    /**
     * 组装书架 UI、页面主题与书籍操作。
     * @param onReadBook - 将选定书籍 ID 交给页面外部的阅读路由
     */
    public constructor(
        bookshelfRoot: HTMLElement,
        private readonly onReadBook: (bookId: string) => void
    ) {
        // 按页面区域创建 UI，书籍内容区独立滚动并保存浏览位置。
        this.headerUi = new HeaderUi(assertExists(bookshelfRoot.querySelector<HTMLElement>("#header")));
        this.navUi = new NavUi(assertExists(bookshelfRoot.querySelector<HTMLElement>("#nav")));
        this.bookListUi = new BookListUi(assertExists(bookshelfRoot.querySelector<HTMLElement>("#book-list")));
        this.bookshelfUi = new BookshelfUi(bookshelfRoot);
        assertExists(bookshelfRoot.querySelector<HTMLInputElement>("#book-input")).accept = BOOK_FILE_ACCEPT;

        // 书架外观独立保存，阅读排版仍由阅读器设置。
        this.settingController = new SettingController({
            pageName: PageName.BOOKSHELF,
            container: this.bookshelfUi.root,
            settings: createBookshelfSettings(this.bookshelfUi.root, this.bookListUi.root),
        });
    }

    /**
     * 先同步恢复外观，再加载领域摘要和会话内浏览位置。
     */
    public async init(signal: AbortSignal): Promise<void> {
        // 外观和资源清理先同步就位，避免异步数据加载期间显示默认样式。
        this.signal = signal;
        this.settingController.init(signal);
        this.bookshelfUi.bindLifecycle(signal);

        // 读取期间仍可修改筛选；首次成功后的恢复使用当时的会话位置。
        this.navUi.renderNav(bookshelfSession.categoryId);
        this.bindEvent(signal);
        this.renderBooks();

        await this.refreshBooks();
    }

    /**
     * 异步边界之后重新读取生命周期状态。
     */
    private isActive(): boolean {
        return !this.signal.aborted;
    }

    /**
     * 保存书架位置后通过既有路由进入阅读器。
     */
    private readBook(bookId: string): void {
        if (!this.isActive() || this.busy) return;
        bookshelfSession.scrollTop = this.bookListUi.root.scrollTop;
        bookshelfSession.focusBookId = bookId;
        this.onReadBook(bookId);
    }

    /**
     * 在重新读取期间允许切换分类，响应只更新最新请求且按当前筛选渲染。
     */
    private async refreshBooks(): Promise<void> {
        const version = ++this.refreshVersion;
        const firstLoad = this.books === null;
        if (firstLoad) this.bookListUi.renderLoadState("loading");
        try {
            const books = await getBookSummaries();
            if (!this.isActive() || version !== this.refreshVersion) return;
            this.books = books;
            this.renderBooks();
            // 查询或分类改变已将会话位置清零，不能再恢复进入页面时的旧位置。
            if (firstLoad) {
                this.bookListUi.root.scrollTop = bookshelfSession.scrollTop;
                this.bookListUi.restoreBookFocus(bookshelfSession.focusBookId);
            }
        } catch (error) {
            // 已有摘要仍可保留；首次读取失败则提供原位重试，错误继续进入统一提示。
            if (this.isActive() && version === this.refreshVersion && this.books === null)
                this.bookListUi.renderLoadState("error");
            throw new OperationError(
                "书架暂时无法读取",
                "Aura 没有读到书架中的书籍信息，当前列表可能不是最新结果。",
                error,
                "请关闭提示后点击“重新读取”，或重新打开书架。"
            );
        }
    }

    /**
     * 数据已提交后，刷新失败只报告列表未更新，保留结果以免用户重复执行。
     */
    private async refreshAfterChange(result: string): Promise<void> {
        try {
            await this.refreshBooks();
        } catch (error) {
            throw new OperationError(
                "操作已完成，书架尚未更新",
                result,
                error,
                "请重新打开书架查看，无需重复执行刚才的操作。"
            );
        }
    }

    /**
     * 分类和书名搜索共用同一摘要列表，不发起并发分类查询。
     */
    private renderBooks(): void {
        const category = getCategory(bookshelfSession.categoryId)?.name ?? "全部书籍";
        this.navUi.setActive(bookshelfSession.categoryId);
        if (this.books === null) {
            this.headerUi.render(category, null, bookshelfSession.search);
            return;
        }

        // 分类与搜索共同筛选缓存摘要，始终基于当前会话查询。
        const query = bookshelfSession.search.trim().toLocaleLowerCase();
        const books = this.books.filter(
            ({ book, title }) =>
                (!bookshelfSession.categoryId || book.categoryId === bookshelfSession.categoryId) &&
                title.toLocaleLowerCase().includes(query)
        );

        // 列表、数量与导航选中态使用同一份筛选结果。
        const emptyState: BookListEmptyState = query
            ? "search"
            : bookshelfSession.categoryId && this.books.length > 0
              ? "category"
              : "library";
        this.bookListUi.renderBooks(books, emptyState);
        this.headerUi.render(category, books.length, bookshelfSession.search);
    }

    /**
     * 单次批量导入结束后汇总所有结果，继续允许同内容建立不同书籍记录。
     */
    private async importBooks(files: File[]): Promise<void> {
        if (files.length === 0 || this.busy || !this.isActive()) return;

        // 批次开始时确定目标分类，文件接受范围与拒绝原因由导入服务统一判断。
        const categoryId = bookshelfSession.categoryId || DEFAULT_CATEGORY_ID;
        let result: BookImportResult = { books: [], rejectedFiles: [] };

        // 导入与列表刷新共用忙碌状态，避免结果尚未可见就接受下一次操作。
        this.busy = true;
        try {
            await this.bookshelfUi.runBusy(`正在导入 ${String(files.length)} 个文件…`, async (setStatus) => {
                result = await importBooks(files, categoryId, setStatus);
                await this.refreshAfterChange(this.describeImport(result));
            });
            if (!this.isActive()) return;

            // 部分跳过用结果对话框展示明细，全成功只提供短暂反馈。
            const skipped = result.rejectedFiles.length;
            if (skipped > 0) {
                const { title, content } = createErrorContent(
                    new OperationError(
                        result.books.length > 0 ? "部分文件未导入" : "所选文件未能导入",
                        this.describeImport(result),
                        undefined,
                        "请按上面的原因检查文件，确认后只重新导入未成功的文件。"
                    )
                );
                await this.bookshelfUi.dialog.alert(content, { title, confirmBtnText: "知道了", tone: "error" });
            } else {
                this.bookshelfUi.showFeedback(`已导入 ${String(result.books.length)} 本书`);
            }
        } catch (error) {
            if (error instanceof BookImportError && this.isActive()) {
                // 批次结果不依赖刷新成功；两次失败都保留，并标明列表可能尚未更新。
                let cause = error.cause;
                let details = `${this.describeImport(error.result)}\n未完成：${error.unfinishedFiles.map((file) => file.name).join("、")}`;
                try {
                    await this.refreshBooks();
                } catch (refreshError) {
                    cause = new AggregateError([cause, refreshError], "导入中断且书架刷新失败", { cause });
                    details += "\n\n书架刷新失败，已保存的书籍仍会保留，请重新打开书架查看。";
                }
                if (!this.isActive()) return;

                throw new OperationError(
                    "导入已中断",
                    details,
                    cause,
                    "已导入的书籍无需重复导入。请处理失败原因后，只重新选择未完成的文件。"
                );
            }

            throw error;
        } finally {
            this.busy = false;
            if (this.isActive()) this.bookListUi.restoreImportFocus();
        }
    }

    /**
     * 生成一次可读的批次结果，文件名始终作为纯文本展示。
     */
    private describeImport(result: BookImportResult): string {
        const messages = [`已导入 ${String(result.books.length)} 本书。`];
        if (result.books.length > 0) messages.push(`成功：${result.books.map((book) => book.fileName).join("、")}`);
        messages.push(...result.rejectedFiles.map(({ file, reason }) => `${file.name}：${reason}`));
        return messages.join("\n");
    }

    /**
     * 读取原文件后交给浏览器下载；取消保存由浏览器处理，不改变书架或阅读进度。
     */
    private async exportBook(bookId: string): Promise<void> {
        if (this.busy || !this.isActive()) return;
        this.busy = true;
        try {
            let file: Awaited<ReturnType<typeof getBookExport>>;
            try {
                file = await getBookExport(bookId);
            } catch (error) {
                throw new OperationError(
                    "原文件未能导出",
                    "Aura 没有读到这本书的原文件，下载尚未开始。",
                    error,
                    "请重新打开书架后再次导出。"
                );
            }
            if (!this.isActive()) return;
            this.bookshelfUi.download(file.source, file.name);
            this.bookshelfUi.showFeedback("原文件已交给浏览器下载");
        } finally {
            this.busy = false;
        }
    }

    /**
     * 删除前明确书名和数据影响，取消后仍停留在原书籍。
     */
    private async deleteBook(bookId: string): Promise<void> {
        if (this.busy || !this.isActive()) return;
        const summary = assertExists(this.books?.find(({ book }) => book.id === bookId));

        // 等待确认期间保持互斥；取消或退出页面都不能继续删除。
        this.busy = true;
        try {
            const confirmed = await this.bookshelfUi.dialog.confirm(
                `确定删除《${summary.title}》吗？阅读进度也会删除。`,
                {
                    title: "删除书籍",
                    confirmBtnText: "删除",
                    destructive: true,
                }
            );
            if (!confirmed || !this.isActive()) return;

            // 删除提交后再刷新列表，成功提示仅投递给仍存活的页面。
            await this.bookshelfUi.runBusy("正在删除书籍…", async () => {
                try {
                    await deleteBook(bookId);
                } catch (error) {
                    throw new OperationError(
                        "书籍未能删除",
                        `未能删除《${summary.title}》。`,
                        error,
                        "请重新打开书架，确认书籍当前状态后再删除。"
                    );
                }
                await this.refreshAfterChange(`已删除《${summary.title}》及其阅读进度。`);
            });
            if (this.isActive()) this.bookshelfUi.showFeedback(`已删除《${summary.title}》`);
        } finally {
            this.busy = false;
        }
    }

    /**
     * 持久化成功后才更新页面摘要，保存失败时由选择器恢复原值。
     * @returns 是否接受目标分类；提交成功后即使页面已退出也返回 true
     */
    private async moveBook(bookId: string, categoryId: string): Promise<boolean> {
        if (this.busy || !this.isActive()) return false;
        const summary = assertExists(this.books?.find(({ book }) => book.id === bookId));
        if (summary.book.categoryId === categoryId) return true;
        const category = assertExists(getCategory(categoryId), "Category not found");

        // 先提交领域操作，页面退出只停止渲染，不把已保存结果报告为失败。
        this.busy = true;
        try {
            try {
                await moveBook(bookId, categoryId);
            } catch (error) {
                throw new OperationError(
                    "分类未能更改",
                    `未能将《${summary.title}》移至“${category.name}”。`,
                    error,
                    "请重新打开书架，确认当前分类后再选择。"
                );
            }
            if (!this.isActive()) return true;

            // 新快照让列表只更新归属发生变化的书卡，其余摘要可继续复用。
            this.books = assertExists(this.books).map((item) =>
                item === summary ? { ...item, book: { ...item.book, categoryId: category.id } } : item
            );
            this.renderBooks();
            this.bookshelfUi.showFeedback(`已移至${category.name}`);
            return true;
        } finally {
            this.busy = false;
        }
    }

    /**
     * 低频清空操作保留明确的范围和不可撤销提示。
     */
    private async clearBookshelf(): Promise<void> {
        if (this.busy || !this.isActive()) return;

        // 先确认所有分类的数据影响，并在确认返回后重新核对生命周期。
        this.busy = true;
        try {
            if (
                !(await this.bookshelfUi.dialog.confirm("确定清空所有分类中的书籍和阅读进度吗？此操作无法撤销。", {
                    title: "清空书架",
                    confirmBtnText: "清空",
                    destructive: true,
                })) ||
                !this.isActive()
            )
                return;

            // 空列表渲染后将焦点交给列表，避免停留在已删除的书目上。
            await this.bookshelfUi.runBusy("正在清空书架…", async () => {
                try {
                    await clearBookshelf();
                } catch (error) {
                    throw new OperationError(
                        "书架未能清空",
                        "Aura 未能完成清空书籍和阅读进度的操作。",
                        error,
                        "请重新打开书架，确认当前内容后再尝试清空。"
                    );
                }
                await this.refreshAfterChange("已清空所有分类中的书籍和阅读进度，外观设置保持不变。");
            });
            if (this.isActive()) this.bookListUi.root.focus({ preventScroll: true });
        } finally {
            this.busy = false;
        }
    }

    /**
     * 确认后删除 Aura 的全部数据，成功才刷新；旧结构导致书架加载失败时也可执行。
     */
    private async resetData(): Promise<void> {
        if (this.busy || !this.isActive()) return;

        this.busy = true;
        try {
            const confirmed = await this.bookshelfUi.confirmDataReset();
            if (!confirmed || !this.isActive()) return;

            await this.bookshelfUi.runBusy("正在重置数据，完成后将自动刷新…", async (setStatus) => {
                await resetData(() => {
                    setStatus("请关闭其他 Aura 标签页或窗口，数据重置将在解除占用后自动继续…");
                });

                window.location.reload();
            });
        } finally {
            this.busy = false;
        }
    }

    /**
     * 所有页面事件受同一生命周期信号管理。
     */
    private bindEvent(signal: AbortSignal): void {
        // 分类导航更新会话位置，清空入口复用互斥操作流程。
        this.navUi.bindEvents(
            {
                category: (categoryId) => {
                    if (this.busy) return;
                    bookshelfSession.categoryId = categoryId;
                    bookshelfSession.scrollTop = 0;
                    this.renderBooks();
                    this.bookListUi.root.scrollTop = 0;
                },
                clear: () => this.clearBookshelf(),
                reset: () => this.resetData(),
            },
            signal
        );

        // 查询变化从列表顶部开始，导入和外观入口复用各自的处理流程。
        this.headerUi.bindEvents(
            (query) => {
                bookshelfSession.search = query;
                bookshelfSession.scrollTop = 0;
                this.renderBooks();
                this.bookListUi.root.scrollTop = 0;
            },
            (files) => this.importBooks(files),
            (opener) => {
                this.settingController.toggle(opener);
            },
            signal
        );

        // 书目操作只传递领域标识，持久化细节由控制器与服务处理。
        this.bookListUi.bindEvents(
            {
                read: (bookId) => {
                    this.readBook(bookId);
                },
                delete: (bookId) => this.deleteBook(bookId),
                move: (bookId, categoryId) => this.moveBook(bookId, categoryId),
                export: (bookId) => this.exportBook(bookId),
                import: () => {
                    if (this.isActive() && !this.busy) this.headerUi.openFilePicker();
                },
                retry: async () => {
                    if (this.isActive() && !this.busy) await this.refreshBooks();
                },
            },
            signal
        );

        // 将滚动位置写入内存会话，返回书架时由初始化流程恢复。
        bind(
            this.bookListUi.root,
            "scroll",
            () => {
                // 加载和错误提示不是书籍列表，不能覆盖仍待恢复的浏览位置。
                if (this.books !== null) bookshelfSession.scrollTop = this.bookListUi.root.scrollTop;
            },
            { signal, passive: true }
        );
    }
}
