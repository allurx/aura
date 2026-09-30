/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import HeaderUi from "./header/header-ui";
import NavUi from "./nav/nav-ui";
import BookListUi from "./book-list/book-list-ui";
import BookshelfUi from "./bookshelf-ui";
import {
    BookImportError,
    clearBookshelf,
    deleteBook,
    getBookSummaries,
    importBooks,
    moveBook,
    type BookImportResult,
    type BookSummary,
} from "./bookshelf-service";
import { bookshelfSession } from "./bookshelf-state";
import { DEFAULT_CATEGORY_ID, getCategory } from "@/domain/category/category";
import { bind } from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import { createBookshelfSettings } from "@/settings/definitions/setting-catalog";
import SettingController from "@/settings/setting-controller";
import { PageName } from "@/constants/page-name";
import OperationError from "@/errors/operation-error";
import { resetData } from "@/reset-data";

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
    private books: BookSummary[] = [];
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

        // 初次渲染会触发滚动回写，先保留进入页面时的会话位置。
        const savedScrollTop = bookshelfSession.scrollTop;
        this.navUi.renderNav(bookshelfSession.categoryId);
        this.bindEvent(signal);

        // 列表渲染完成后再恢复位置，焦点恢复本身不触发滚动。
        await this.refreshBooks();
        if (this.isActive()) {
            this.bookListUi.root.scrollTop = savedScrollTop;
            this.bookListUi.restoreBookFocus(bookshelfSession.focusBookId);
        }
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
        const books = await getBookSummaries();
        if (!this.isActive() || version !== this.refreshVersion) return;
        this.books = books;
        this.renderBooks();
    }

    /**
     * 数据已提交后，刷新失败只报告列表未更新，保留结果以免用户重复执行。
     */
    private async refreshAfterChange(result: string): Promise<void> {
        try {
            await this.refreshBooks();
        } catch (error) {
            throw new OperationError(
                "数据操作已完成，但书架刷新失败。",
                `${result}\n\n请重新打开书架查看，无需重复执行刚才的操作。`,
                error
            );
        }
    }

    /**
     * 分类和书名搜索共用同一摘要列表，不发起并发分类查询。
     */
    private renderBooks(): void {
        // 分类与搜索共同筛选缓存摘要，始终基于当前会话查询。
        const query = bookshelfSession.search.trim().toLocaleLowerCase();
        const books = this.books.filter(
            ({ book, title }) =>
                (!bookshelfSession.categoryId || book.categoryId === bookshelfSession.categoryId) &&
                title.toLocaleLowerCase().includes(query)
        );

        // 列表、数量与导航选中态使用同一份筛选结果。
        this.bookListUi.renderBooks(books, query.length > 0);
        this.headerUi.render(
            getCategory(bookshelfSession.categoryId)?.name ?? "全部书籍",
            books.length,
            bookshelfSession.search
        );
        this.navUi.setActive(bookshelfSession.categoryId);
    }

    /**
     * 单次批量导入结束后汇总所有结果，继续允许同内容建立不同书籍记录。
     */
    private async importBooks(files: File[]): Promise<void> {
        if (files.length === 0 || this.busy || !this.isActive()) return;

        // 批次开始时确定可导入文件与目标分类，执行期间不随 UI 筛选变化。
        const invalidFiles = files.filter((file) => !/\.txt$/i.test(file.name));
        const validFiles = files.filter((file) => /\.txt$/i.test(file.name));
        const categoryId = bookshelfSession.categoryId || DEFAULT_CATEGORY_ID;
        let result: BookImportResult = { books: [], unsupportedEncodingFiles: [] };

        // 导入与列表刷新共用忙碌状态，避免结果尚未可见就接受下一次操作。
        this.busy = true;
        try {
            await this.bookshelfUi.runBusy(`正在导入 ${String(validFiles.length)} 个 TXT 文件…`, async (setStatus) => {
                result = await importBooks(validFiles, categoryId, setStatus);
                await this.refreshAfterChange(this.describeImport(result, invalidFiles));
            });
            if (!this.isActive()) return;

            // 部分跳过用结果对话框展示明细，全成功只提供短暂反馈。
            const skipped = invalidFiles.length + result.unsupportedEncodingFiles.length;
            if (skipped > 0) {
                await this.bookshelfUi.dialog.alert(
                    `已导入 ${String(result.books.length)} 本；${String(skipped)} 个文件未导入。\n\n${this.describeImport(result, invalidFiles)}`,
                    { title: "导入结果" }
                );
            } else {
                this.bookshelfUi.showFeedback(`已导入 ${String(result.books.length)} 本书`);
            }
        } catch (error) {
            if (error instanceof BookImportError && this.isActive()) {
                // 批次结果不依赖刷新成功；两次失败都保留，并标明列表可能尚未更新。
                let cause = error.cause;
                let details = `${this.describeImport(error.result, invalidFiles)}\n未完成：${error.unfinishedFiles.map((file) => file.name).join("、")}`;
                try {
                    await this.refreshBooks();
                } catch (refreshError) {
                    cause = new AggregateError([cause, refreshError], "导入中断且书架刷新失败", { cause });
                    details += "\n\n书架刷新失败，已保存的书籍仍会保留，请重新打开书架查看。";
                }
                if (!this.isActive()) return;

                throw new OperationError(
                    `导入中断：已导入 ${String(error.result.books.length)} 本；未完成 ${String(error.unfinishedFiles.length)} 个文件。`,
                    details,
                    cause
                );
            }

            throw error;
        } finally {
            this.busy = false;
        }
    }

    /**
     * 生成一次可读的批次结果，文件名始终作为纯文本展示。
     */
    private describeImport(result: BookImportResult, invalidFiles: File[]): string {
        const messages = [`已导入 ${String(result.books.length)} 本书。`];
        if (result.books.length > 0) messages.push(`成功：${result.books.map((book) => book.fileName).join("、")}`);
        if (invalidFiles.length > 0) messages.push(`非 TXT 文件：${invalidFiles.map((file) => file.name).join("、")}`);
        if (result.unsupportedEncodingFiles.length > 0)
            messages.push(
                `编码无法可靠识别或不受支持：${result.unsupportedEncodingFiles.map((file) => file.name).join("、")}`
            );
        return messages.join("\n");
    }

    /**
     * 删除前明确书名和数据影响，取消后仍停留在原书籍。
     */
    private async deleteBook(bookId: string): Promise<void> {
        if (this.busy || !this.isActive()) return;
        const summary = assertExists(this.books.find(({ book }) => book.id === bookId));

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
                await deleteBook(bookId);
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
        const summary = assertExists(this.books.find(({ book }) => book.id === bookId));
        if (summary.book.categoryId === categoryId) return true;
        const category = assertExists(getCategory(categoryId), "Category not found");

        // 先提交领域操作，页面退出只停止渲染，不把已保存结果报告为失败。
        this.busy = true;
        try {
            await moveBook(bookId, categoryId);
            if (!this.isActive()) return true;

            summary.book.categoryId = category.id;
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
                await clearBookshelf();
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

        // 查询变化从列表顶部开始，导入与外观继续交给各自控制器。
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
            (bookId) => {
                this.readBook(bookId);
            },
            (bookId) => this.deleteBook(bookId),
            (bookId, categoryId) => this.moveBook(bookId, categoryId),
            signal
        );

        // 会话只记录滚动位置，返回书架时再由初始化流程恢复。
        bind(
            this.bookListUi.root,
            "scroll",
            () => {
                bookshelfSession.scrollTop = this.bookListUi.root.scrollTop;
            },
            { signal, passive: true }
        );
    }
}
