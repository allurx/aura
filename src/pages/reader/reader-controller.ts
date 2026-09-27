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
import AppUi from "./app/app-ui";
import ReaderUi from "./reader-ui";
import Progress from "@/domain/progress/progress";
import ReaderService from "./reader-service";
import HeaderUi from "./header/header-ui";
import ContentUi from "./content/content-ui";
import FooterUi from "./footer/footer-ui";
import TocUi from "./toc/toc-ui";
import type ReaderState from "./reader-state";
import SettingCatalog from "@/settings/definitions/setting-catalog";
import SettingController from "@/settings/setting-controller";
import { SwitchChapterDirection } from "./switch-chapter-direction";
import { assertExists } from "@/utils/assert-util";
import { PageName } from "@/constants/page-name";

/**
 * 阅读器控制器
 * @author allurx
 */
export default class ReaderController {
    private readonly appUi: AppUi;
    private readonly readerUi: ReaderUi;
    private readonly headerUi: HeaderUi;
    private readonly contentUi: ContentUi;
    private readonly footerUi: FooterUi;
    private readonly tocUi: TocUi;
    private readonly settingController: SettingController;
    private readonly readerService: ReaderService;
    private state!: ReaderState;
    private initialized = false;
    private signal!: AbortSignal;
    private chapterLoading = false;
    private returningToBookshelf = false;
    // 外观预览会改变换行；关闭前以原位置为准，避免把预览布局写成阅读进度。
    private appearancePosition: ReturnType<ContentUi["readProgress"]>;
    private progressWrite: Promise<void> = Promise.resolve();

    /**
     * 组装阅读界面，路由回调由应用入口提供。
     */
    public constructor(
        appRoot: HTMLElement,
        readerRoot: HTMLElement,
        private readonly onReturnToBookshelf: () => void
    ) {
        // 组装服务与顶层 UI，区分持久画布和当前阅读页。
        this.readerService = new ReaderService();

        this.appUi = new AppUi({
            root: appRoot,
        });
        this.readerUi = new ReaderUi({
            root: readerRoot,
        });

        // 绑定模板中的阅读内容、信息栏与章节目录。
        this.headerUi = new HeaderUi({
            root: assertExists(readerRoot.querySelector<HTMLElement>("#header")),
        });
        this.contentUi = new ContentUi({
            root: assertExists(readerRoot.querySelector<HTMLElement>("#content")),
        });
        this.footerUi = new FooterUi({
            root: assertExists(readerRoot.querySelector<HTMLElement>("#footer")),
        });
        this.tocUi = new TocUi({
            root: assertExists(readerRoot.querySelector<HTMLElement>("#toc")),
        });

        // 主题与常规阅读设置独立于书籍和进度保存。
        this.settingController = new SettingController({
            pageName: PageName.READER,
            container: this.readerUi.root,
            inertElements: [this.readerUi.actions],
            settings: SettingCatalog.reader(this.readerUi.root, this.contentUi.root),
        });
    }

    /**
     * 首个 await 前恢复外观和工具布局，书籍加载后仅为仍有效的页面绑定阅读交互。
     */
    public async init(bookId: string, signal: AbortSignal): Promise<void> {
        // 在可能触发异步加载前注册退出清理，离开时保留最后一次有效位置。
        this.signal = signal;
        signal.addEventListener(
            "abort",
            () => {
                // 路由离开时 DOM 尚在；保存最后一次滚动，但不再更新已销毁页面。
                if (this.initialized && !this.chapterLoading && !this.returningToBookshelf) {
                    const position = this.appearancePosition ?? this.contentUi.readProgress();
                    if (position) EventUtil.run(() => this.updateProgress({ ...position, updatedTime: Date.now() }));
                }
                this.appUi.cleanup();
            },
            { once: true }
        );

        // 首次绘制使用已保存外观和移动布局，避免等待数据库后才切换显示。
        this.settingController.init(signal);
        this.readerUi.bindResponsiveControls(signal);

        // 只有当前页面仍有效时才提交初始状态、渲染章节并接受交互。
        const state = await this.readerService.init(bookId);
        if (signal.aborted) return;
        this.state = state;
        this.initialized = true;
        this.headerUi.renderBookTitle(state.book.fileName);
        this.tocUi.renderEntries(state.toc.entries);
        this.renderCurrentChapter();
        this.bindEvent(signal);
    }

    /**
     * 渲染当前章、工具栏切章状态和阅读进度。
     */
    private renderCurrentChapter(): void {
        // 正文先重建，再按段落锚点恢复位置，不能沿用旧章节的像素偏移。
        this.contentUi
            .renderChapter(this.state.chapter.title, this.state.chapter.lines)
            .restoreProgress(this.state.progress.chapterLineNumber, this.state.progress.lineVisibleRatio);
        this.readerUi.renderChapterNavigation(this.state.progress.chapterNumber, this.state.toc.numberOfChapters());

        // 底栏与目录显示同一份已提交进度。
        this.footerUi
            .renderChapterTitle(this.state.chapter.title)
            .renderProgress(
                this.state.chapter.toBookLineNumber(this.state.progress.chapterLineNumber),
                this.state.toc.numberOfLines()
            );
        this.tocUi.highlightCurrentChapter(this.state.progress.chapterNumber);
    }

    /**
     * 按提交顺序保存独立快照，存储成功后才更新内存进度；失败交给调用方反馈。
     */
    private async updateProgress(progress: Partial<Progress>): Promise<void> {
        const snapshot = new Progress(structuredClone(this.state.progress)).update(progress);
        const write = this.progressWrite.then(() => this.readerService.updateProgress(snapshot));

        // 队列保留继续写入的能力；本次失败仍由下面的 await 抛给调用方。
        this.progressWrite = write.catch(() => undefined);
        await write;
        this.state.progress.update(snapshot);
    }

    /**
     * 先保存旧位置，再获取并保存目标章；存储成功且页面仍有效时才重绘正文。
     */
    private async selectChapter(chapterNumber: number): Promise<void> {
        // 拒绝重入与无效章序，避免无效操作覆盖当前进度。
        if (this.chapterLoading || this.returningToBookshelf || this.signal.aborted) return;
        if (chapterNumber === this.state.progress.chapterNumber) return;
        if (chapterNumber < 1 || chapterNumber > this.state.toc.numberOfChapters()) return;

        // 固定离开当前章的位置，取消仍可能读取旧 DOM 的延迟滚动回调。
        const currentPosition = this.contentUi.readProgress();
        this.chapterLoading = true;
        this.contentUi.cancelPendingScroll();
        try {
            await this.readerUi.showOverlayWhile(async () => {
                // 保存也属于切章过程；加载中离开页面时仍保留最后一次滚动。
                if (currentPosition) await this.updateProgress({ ...currentPosition, updatedTime: Date.now() });
                if (!this.isActive()) return;

                // 每个异步阶段重新确认生命周期，失败前不替换当前正文。
                const chapter = await this.readerService.getChapter(this.state.book.fileId, chapterNumber);
                if (!this.isActive()) return;

                // 新章进度先持久化，再将正文和工具状态切换到目标章。
                await this.updateProgress({
                    chapterNumber,
                    chapterLineNumber: 1,
                    lineVisibleRatio: 1,
                    updatedTime: Date.now(),
                });
                if (!this.isActive()) return;
                this.state.chapter = chapter;
                this.renderCurrentChapter();
                this.readerUi.hideReadingTools();
            });
        } finally {
            this.chapterLoading = false;
        }
    }

    /**
     * 跨异步边界重新读取页面生命周期，不沿用调用前的状态。
     */
    private isActive(): boolean {
        return !this.signal.aborted;
    }

    /**
     * 将按钮、手势和键盘统一到同一切章流程。
     */
    private async switchChapter(direction: SwitchChapterDirection): Promise<void> {
        if (this.readerUi.root.querySelector("#setting.open, #toc[open]")) return;
        if (direction === SwitchChapterDirection.PREV) await this.selectChapter(this.state.progress.chapterNumber - 1);
        else if (direction === SwitchChapterDirection.NEXT)
            await this.selectChapter(this.state.progress.chapterNumber + 1);
    }

    /**
     * 等待最新位置写入成功后再离开，失败时留在当前正文供重试。
     */
    private async returnToBookshelf(): Promise<void> {
        // 离开与切章互斥，退出流程直接保存当前位置，不等待滚动防抖。
        if (this.chapterLoading || this.returningToBookshelf) return;
        this.returningToBookshelf = true;
        this.contentUi.cancelPendingScroll();

        // 写入失败时保留当前页面；路由已销毁时不重复跳转。
        try {
            const position = this.contentUi.readProgress();
            if (position) await this.updateProgress({ ...position, updatedTime: Date.now() });
            if (!this.signal.aborted) this.onReturnToBookshelf();
        } finally {
            this.returningToBookshelf = false;
        }
    }

    /**
     * 为当前页面注册可随生命周期清理的交互。
     */
    private bindEvent(signal: AbortSignal): void {
        // 仅移动布局接受正文切章手势，中部轻点保留给工具显隐。
        this.appUi.bindReadingGestures(
            this.contentUi.root,
            async (direction) => {
                if (this.readerUi.root.hasAttribute("data-mobile-controls")) await this.switchChapter(direction);
            },
            () => {
                if (this.chapterLoading || this.returningToBookshelf) return;
                this.readerUi.toggleReadingTools();
            },
            signal
        );

        // 返回先提交进度；全屏切换前后用同一段落锚点保持阅读位置。
        this.readerUi
            .bindChapterNavigation((direction) => this.switchChapter(direction), signal)
            .bindReturnToBookshelf(() => this.returnToBookshelf(), signal)
            .bindToggleFullscreen(async () => {
                if (this.chapterLoading || this.returningToBookshelf) return;
                try {
                    const position = this.contentUi.readProgress();
                    await this.appUi.toggleFullscreen();
                    if (signal.aborted) return;
                    if (position) this.contentUi.restoreProgress(position.chapterLineNumber, position.lineVisibleRatio);
                    this.contentUi.dispatchContentScroll();
                } catch {
                    if (!signal.aborted) await this.readerUi.alertDialog("当前浏览器不支持全屏功能");
                }
            }, signal);

        // 同一组可移动入口交给各浮层，展开和焦点状态不依赖按钮所在容器。
        this.readerUi
            .bindToggleSettingPanel((opener) => {
                if (this.chapterLoading || this.returningToBookshelf) return;
                this.settingController.toggle(opener);
            }, signal)
            .bindToggleTocPanel(() => {
                if (this.chapterLoading || this.returningToBookshelf) return;
                this.tocUi.highlightCurrentChapter(this.state.progress.chapterNumber);
                this.readerUi.setTocExpanded(this.tocUi.toggleToc());
            }, signal);

        // 正文键盘复用切章流程，滚动保存只接受稳定正文的位置。
        this.contentUi
            .bindKeyboardNavigation((direction) => this.switchChapter(direction), signal)
            .bindContentScroll(async (chapterLineNumber, lineVisibleRatio) => {
                if (this.chapterLoading || this.returningToBookshelf || this.appearancePosition) return;
                await this.updateProgress({ chapterLineNumber, lineVisibleRatio, updatedTime: Date.now() });
                if (signal.aborted) return;
                this.footerUi.renderProgress(
                    this.state.chapter.toBookLineNumber(chapterLineNumber),
                    this.state.toc.numberOfLines()
                );
            }, signal);

        // 选章成功回到正文；取消目录仍由原生对话框恢复入口焦点。
        this.tocUi
            .delegateTocItemClick((chapterNumber) => this.selectChapter(chapterNumber), signal)
            .bindTocClose((chapterSelected) => {
                this.readerUi.setTocExpanded(false);
                if (chapterSelected) {
                    this.readerUi.hideReadingTools();
                    this.contentUi.root.focus({ preventScroll: true });
                }
            }, signal);

        // 外观预览期间冻结阅读锚点，关闭后按最终布局恢复并重新同步进度。
        EventUtil.bind(
            this.readerUi.root,
            "appearance-open",
            () => {
                this.contentUi.cancelPendingScroll();
                this.appearancePosition = this.contentUi.readProgress();
            },
            { signal }
        );
        EventUtil.bind(
            this.readerUi.root,
            "appearance-close",
            () => {
                const position = this.appearancePosition;
                this.appearancePosition = undefined;
                if (position) this.contentUi.restoreProgress(position.chapterLineNumber, position.lineVisibleRatio);
                this.contentUi.dispatchContentScroll();
            },
            { signal }
        );
    }
}
