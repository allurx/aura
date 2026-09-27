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

import HeaderUi from "./header/header-ui";
import NavUi from "./nav/nav-ui";
import BookListUi from "./book-list/book-list-ui";
import BookshelfUi from "./bookshelf-ui";
import BookshelfService, { BookImportError, type BookImportResult, type BookSummary } from "./bookshelf-service";
import type BookshelfState from "./bookshelf-state";
import { bookshelfSession } from "./bookshelf-state";
import EventUtil from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import SettingCatalog from "@/settings/definitions/setting-catalog";
import SettingTarget from "@/settings/models/setting-target";
import SettingController from "@/settings/setting-controller";
import { PageName } from "@/constants/page-name";

/**
 * 编排书架筛选、数据操作与页面外观，并在异步渲染前核对页面生命周期。
 * @author allurx
 */
export default class BookshelfController {
    private readonly headerUi: HeaderUi;
    private readonly navUi: NavUi;
    private readonly bookListUi: BookListUi;
    private readonly bookshelfUi: BookshelfUi;
    private readonly settingController: SettingController;
    private readonly bookshelfService: BookshelfService;
    private state!: BookshelfState;
    private signal!: AbortSignal;
    private books: BookSummary[] = [];
    private refreshVersion = 0;
    // 等待确认对话框期间也保持互斥，避免重复确认或并行写入。
    private busy = false;

    /**
     * 组装书架各区域 UI，并声明它们独立可调的外观能力。
     * @param onReadBook - 将选定书籍 ID 交给页面外部的阅读路由
     */
    public constructor(
        bookshelfRoot: HTMLElement,
        private readonly onReadBook: (bookId: string) => void
    ) {
        // 按页面区域创建 UI，列表使用包含工具栏的主区域保存滚动位置。
        this.headerUi = new HeaderUi({
            root: assertExists(bookshelfRoot.querySelector<HTMLElement>("#header")),
            displayName: "工具栏",
        });
        this.navUi = new NavUi({
            root: assertExists(bookshelfRoot.querySelector<HTMLElement>("#nav")),
            displayName: "导航",
        });
        this.bookListUi = new BookListUi({
            root: assertExists(bookshelfRoot.querySelector<HTMLElement>("#book-list")),
            scrollContainer: assertExists(bookshelfRoot.querySelector<HTMLElement>("main")),
            displayName: "书籍列表",
        });
        this.bookshelfUi = new BookshelfUi({
            root: bookshelfRoot,
            displayName: "书架",
        });

        // 外观按区域声明能力，页面主题与各区域显式设置保持独立。
        this.settingController = new SettingController({
            pageName: PageName.BOOKSHELF,
            container: this.bookshelfUi.root,
            targets: [
                new SettingTarget(this.bookshelfUi, [SettingCatalog.THEME, SettingCatalog.BACKGROUND_COLOR]),
                new SettingTarget(this.headerUi, [
                    SettingCatalog.FONT_SIZE,
                    SettingCatalog.COLOR,
                    SettingCatalog.BACKGROUND_COLOR,
                    SettingCatalog.PADDING_LEFT,
                    SettingCatalog.PADDING_RIGHT,
                ]),
                new SettingTarget(this.navUi, [
                    SettingCatalog.FONT_SIZE,
                    SettingCatalog.COLOR,
                    SettingCatalog.BACKGROUND_COLOR,
                ]),
                new SettingTarget(this.bookListUi, [
                    SettingCatalog.FONT_SIZE,
                    SettingCatalog.COLOR,
                    SettingCatalog.BACKGROUND_COLOR,
                    SettingCatalog.PADDING_TOP,
                    SettingCatalog.PADDING_LEFT,
                    SettingCatalog.PADDING_BOTTOM,
                    SettingCatalog.PADDING_RIGHT,
                ]),
            ],
        });

        this.bookshelfService = new BookshelfService();
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
        const state = await this.bookshelfService.init();
        if (!this.isActive()) return;

        // 会话分类可能已经不存在，此时回到全部书籍。
        this.state = state;
        state.categoryId = state.categories.some((category) => category.id === bookshelfSession.categoryId)
            ? bookshelfSession.categoryId
            : "";
        this.navUi.renderNav(state.categories, state.categoryId);
        this.bindEvent(signal);

        // 列表渲染完成后再恢复位置，焦点恢复本身不触发滚动。
        await this.refreshBooks();
        if (this.isActive()) {
            this.bookListUi.scrollContainer.scrollTop = savedScrollTop;
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
        bookshelfSession.scrollTop = this.bookListUi.scrollContainer.scrollTop;
        bookshelfSession.focusBookId = bookId;
        this.onReadBook(bookId);
    }

    /**
     * 在重新读取期间允许切换分类，响应只更新最新请求且按当前筛选渲染。
     */
    private async refreshBooks(): Promise<void> {
        const version = ++this.refreshVersion;
        const books = await this.bookshelfService.getBookSummaries();
        if (!this.isActive() || version !== this.refreshVersion) return;
        this.books = books;
        this.renderBooks();
    }

    /**
     * 分类和书名搜索共用同一摘要列表，不发起并发分类查询。
     */
    private renderBooks(): void {
        // 分类与搜索共同筛选缓存摘要，始终基于当前会话查询。
        const query = bookshelfSession.search.trim().toLocaleLowerCase();
        const books = this.books.filter(
            ({ book, title }) =>
                (!this.state.categoryId || book.categoryId === this.state.categoryId) &&
                title.toLocaleLowerCase().includes(query)
        );

        // 列表、数量与导航选中态使用同一份筛选结果。
        this.bookListUi.renderBooks(books, this.state.categories, query.length > 0);
        this.headerUi.render(
            this.state.categories.find((category) => category.id === this.state.categoryId)?.name ?? "全部书籍",
            books.length,
            bookshelfSession.search
        );
        this.navUi.setActive(this.state.categoryId);
    }

    /**
     * 单次批量导入结束后汇总所有结果，继续允许同内容建立不同书籍记录。
     */
    private async importBooks(files: File[]): Promise<void> {
        if (files.length === 0 || this.busy || !this.isActive()) return;

        // 批次开始时确定可导入文件与目标分类，执行期间不随 UI 筛选变化。
        const invalidFiles = files.filter((file) => !/\.txt$/i.test(file.name));
        const validFiles = files.filter((file) => /\.txt$/i.test(file.name));
        const categoryId =
            this.state.categoryId || assertExists(this.state.categories.find((category) => category.order === 1)).id;
        let result: BookImportResult = { books: [], duplicateFiles: [], unsupportedEncodingFiles: [] };

        // 导入与列表刷新共用忙碌状态，避免结果尚未可见就接受下一次操作。
        this.busy = true;
        try {
            await this.bookshelfUi.runBusy(`正在导入 ${String(validFiles.length)} 个 TXT 文件…`, async (setStatus) => {
                result = await this.bookshelfService.importBooks(validFiles, categoryId, true, setStatus);
                await this.refreshBooks();
            });
            if (!this.isActive()) return;

            // 部分跳过保留明细，全成功只提供短暂反馈。
            const skipped = invalidFiles.length + result.duplicateFiles.length + result.unsupportedEncodingFiles.length;
            if (skipped > 0) {
                this.bookshelfUi.renderImportResult(
                    `已导入 ${String(result.books.length)} 本；${String(skipped)} 个文件未导入。`,
                    this.describeImport(result, invalidFiles)
                );
            } else {
                this.bookshelfUi.clearImportResult();
                this.bookshelfUi.showFeedback(`已导入 ${String(result.books.length)} 本书`);
            }
        } catch (error) {
            if (error instanceof BookImportError && this.isActive()) {
                // 先呈现已提交结果，原始异常（包括配额不足）随后交给统一错误处理。
                this.bookshelfUi.renderImportResult(
                    `导入中断：已导入 ${String(error.result.books.length)} 本；未完成 ${String(error.unfinishedFiles.length)} 个文件。`,
                    `${this.describeImport(error.result, invalidFiles)}\n未完成：${error.unfinishedFiles.map((file) => file.name).join("、")}`
                );
                await this.refreshBooks();
                if (!this.isActive()) return;

                throw error.cause;
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
        if (result.duplicateFiles.length > 0)
            messages.push(`重复跳过：${result.duplicateFiles.map((file) => file.name).join("、")}`);
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
            const confirmed = await this.bookshelfUi.confirmDialog(
                `确定删除《${summary.title}》吗？阅读进度也会删除。`,
                {
                    title: "删除书籍",
                    confirmBtnText: "删除",
                }
            );
            if (!confirmed || !this.isActive()) return;

            // 删除提交后再刷新列表，成功提示仅投递给仍存活的页面。
            await this.bookshelfUi.runBusy("正在删除书籍…", async () => {
                await this.bookshelfService.deleteBook(bookId);
                await this.refreshBooks();
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
        const category = assertExists(this.state.categories.find((item) => item.id === categoryId));

        // 先提交领域操作，页面退出只停止渲染，不把已保存结果报告为失败。
        this.busy = true;
        try {
            await this.bookshelfService.moveBook(bookId, categoryId);
            if (!this.isActive()) return true;

            summary.book.update({ categoryId });
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
                !(await this.bookshelfUi.confirmDialog("确定清空所有分类中的书籍和阅读进度吗？此操作无法撤销。", {
                    confirmBtnText: "清空",
                })) ||
                !this.isActive()
            )
                return;

            // 空列表渲染后将焦点交给列表，避免停留在已删除的书目上。
            await this.bookshelfUi.runBusy("正在清空书架…", async () => {
                await this.bookshelfService.clearBookshelf();
                await this.refreshBooks();
            });
            if (this.isActive()) this.bookListUi.root.focus({ preventScroll: true });
        } finally {
            this.busy = false;
        }
    }

    /**
     * 帮助手册使用与普通书籍相同的阅读入口。
     */
    private async openHelp(): Promise<void> {
        if (this.busy || !this.isActive()) return;
        this.busy = true;
        try {
            // 手册可能已被用户删除，先按需恢复再进入普通阅读路由。
            const id = await this.bookshelfService.getHandbookId(
                this.state.metadata,
                assertExists(this.state.categories.find((category) => category.order === 1))
            );

            if (this.isActive()) {
                bookshelfSession.scrollTop = this.bookListUi.scrollContainer.scrollTop;
                this.onReadBook(id);
            }
        } finally {
            this.busy = false;
        }
    }

    /**
     * 所有页面事件受同一生命周期信号管理。
     */
    private bindEvent(signal: AbortSignal): void {
        // 分类导航更新会话位置，帮助与清空入口复用互斥操作流程。
        this.navUi.bindEvents(
            {
                category: (categoryId) => {
                    if (this.busy) return;
                    this.state.categoryId = categoryId;
                    bookshelfSession.categoryId = categoryId;
                    bookshelfSession.scrollTop = 0;
                    this.renderBooks();
                    this.bookListUi.scrollContainer.scrollTop = 0;
                },
                help: () => this.openHelp(),
                clear: () => this.clearBookshelf(),
            },
            signal
        );

        // 查询变化从列表顶部开始，导入与外观继续交给各自控制器。
        this.headerUi.bindEvents(
            (query) => {
                bookshelfSession.search = query;
                bookshelfSession.scrollTop = 0;
                this.renderBooks();
                this.bookListUi.scrollContainer.scrollTop = 0;
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
        EventUtil.bind(
            this.bookListUi.scrollContainer,
            "scroll",
            () => {
                bookshelfSession.scrollTop = this.bookListUi.scrollContainer.scrollTop;
            },
            { signal, passive: true }
        );
    }
}
