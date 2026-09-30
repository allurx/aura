/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { run, bind } from "@/utils/event-util";
import AppUi from "./app/app-ui";
import ReaderUi from "./reader-ui";
import type Progress from "@/domain/progress/progress";
import { toBookLineNumber } from "@/domain/chapter/chapter";
import { numberOfLines } from "@/domain/toc/toc";
import { initReader, updateProgress, getChapter } from "./reader-service";
import ContentUi from "./content/content-ui";
import TocUi from "./toc/toc-ui";
import type ReaderState from "./reader-state";
import { createReaderSettings } from "@/settings/definitions/setting-catalog";
import SettingController from "@/settings/setting-controller";
import { SwitchChapterDirection } from "./switch-chapter-direction";
import { assertExists } from "@/utils/assert-util";
import { PageName } from "@/constants/page-name";
import OperationError from "@/errors/operation-error";

/**
 * 编排章节加载、进度写入与阅读交互，跨异步边界核对页面生命周期。
 */
export default class ReaderController {
    private readonly appUi: AppUi;
    private readonly readerUi: ReaderUi;
    private readonly contentUi: ContentUi;
    private readonly tocUi: TocUi;
    private readonly settingController: SettingController;
    private state!: ReaderState;
    private initialized = false;
    private signal!: AbortSignal;
    private chapterLoading = false;
    private returningToBookshelf = false;
    // 外观预览分别保留视觉锚点和持久化进度，避免压缩的进度丢失标题与段间留白。
    private appearancePosition:
        | {
              readonly visual: ReturnType<ContentUi["readPosition"]>;
              readonly progress: ReturnType<ContentUi["readProgress"]>;
          }
        | undefined;
    private progressWrite: Promise<void> = Promise.resolve();

    /**
     * 组装阅读界面，路由回调由应用入口提供。
     */
    public constructor(
        appRoot: HTMLElement,
        readerRoot: HTMLElement,
        private readonly onReturnToBookshelf: () => void
    ) {
        // 组装顶层 UI，区分持久画布和当前阅读页。
        this.appUi = new AppUi(appRoot);
        this.readerUi = new ReaderUi(readerRoot);

        // 正文位置和目录浏览各自保留独立的交互状态。
        this.contentUi = new ContentUi(assertExists(readerRoot.querySelector<HTMLElement>("#content")));
        this.tocUi = new TocUi(assertExists(readerRoot.querySelector<HTMLDialogElement>("#toc")));

        // 主题与常规阅读设置独立于书籍和进度保存。
        this.settingController = new SettingController({
            pageName: PageName.READER,
            container: this.readerUi.root,
            settings: createReaderSettings(this.readerUi.root, this.contentUi.root),
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
                run(() => this.saveReadingPosition());
                this.appUi.cleanup();
            },
            { once: true }
        );

        // 首次绘制使用已保存外观和移动布局，避免等待数据库后才切换显示。
        this.settingController.init(signal);
        this.readerUi.bindResponsiveControls(signal);

        // 只有当前页面仍有效时才提交初始状态、渲染章节并接受交互。
        const state = await initReader(bookId);
        if (signal.aborted) return;
        this.state = state;
        this.initialized = true;
        this.readerUi.renderBookTitle(state.book.fileName);
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
        this.readerUi.renderChapterNavigation(this.state.progress.chapterNumber, this.state.toc.entries.length);

        // 进度显示与目录标记使用同一份已提交进度。
        this.readerUi.renderChapterInfo(
            this.state.chapter.title,
            toBookLineNumber(this.state.chapter, this.state.progress.chapterLineNumber),
            numberOfLines(this.state.toc)
        );
        this.tocUi.highlightCurrentChapter(this.state.progress.chapterNumber);
    }

    /**
     * 按提交顺序保存独立快照；已删除的书籍退出阅读，真实失败交给调用方反馈。
     */
    private async updateProgress(progress: Partial<Progress>): Promise<void> {
        const snapshot: Progress = { ...this.state.progress, ...progress };
        const write = this.progressWrite.then(() => updateProgress(snapshot));

        // 队列保留继续写入的能力；本次失败仍由下面的 await 抛给调用方。
        this.progressWrite = write.then(
            () => undefined,
            () => undefined
        );
        if (await write) this.state.progress = snapshot;
        else if (!this.signal.aborted && !this.returningToBookshelf) {
            // 复用返回状态，阻止 hash 切换完成前继续交互或重复导航。
            this.returningToBookshelf = true;
            this.contentUi.cancelPendingScroll();
            this.onReturnToBookshelf();
        }
    }

    /**
     * 离开页面或切入后台时立即提交有效锚点，避免依赖可能暂停的滚动防抖。
     * 切章和返回流程已自行保存；外观预览期间仍使用预览前的位置。
     */
    private async saveReadingPosition(): Promise<void> {
        if (!this.initialized || this.chapterLoading || this.returningToBookshelf) return;
        this.contentUi.cancelPendingScroll();
        const position = this.appearancePosition ? this.appearancePosition.progress : this.contentUi.readProgress();
        if (!position) return;
        await this.updateProgress(position);
        if (this.isActive()) {
            this.readerUi.renderProgress(
                toBookLineNumber(this.state.chapter, position.chapterLineNumber),
                numberOfLines(this.state.toc)
            );
        }
    }

    /**
     * 先保存旧位置，再加载目标章并保存其初始进度；写入成功且页面仍有效时才重绘正文。
     */
    private async selectChapter(chapterNumber: number): Promise<void> {
        // 拒绝重入与无效章序，避免无效操作覆盖当前进度。
        if (this.chapterLoading || this.returningToBookshelf || this.signal.aborted) return;
        if (chapterNumber === this.state.progress.chapterNumber) return;
        if (chapterNumber < 1 || chapterNumber > this.state.toc.entries.length) return;

        // 固定离开当前章的位置，取消仍可能读取旧 DOM 的延迟滚动回调。
        const currentPosition = this.contentUi.readProgress();
        this.chapterLoading = true;
        this.contentUi.cancelPendingScroll();
        try {
            await this.readerUi.overlay.showWhile(async () => {
                // 保存也属于切章过程；加载中离开页面时仍保留最后一次滚动。
                if (currentPosition) await this.updateProgress(currentPosition);
                if (!this.isActive()) return;

                // 每个异步阶段重新确认生命周期，失败前不替换当前正文。
                const chapter = await getChapter(this.state.book.fileId, chapterNumber);
                if (!this.isActive()) return;

                // 新章进度先持久化，再将正文和工具状态切换到目标章。
                await this.updateProgress({
                    chapterNumber,
                    chapterLineNumber: 1,
                    lineVisibleRatio: 1,
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
     * 跨异步边界确认页面仍在阅读，已开始返回时不继续更新正文。
     */
    private isActive(): boolean {
        return !this.signal.aborted && !this.returningToBookshelf;
    }

    /**
     * 将按钮、手势和键盘统一到同一切章流程。
     */
    private async switchChapter(direction: SwitchChapterDirection): Promise<void> {
        if (direction === SwitchChapterDirection.PREV) await this.selectChapter(this.state.progress.chapterNumber - 1);
        else if (direction === SwitchChapterDirection.NEXT)
            await this.selectChapter(this.state.progress.chapterNumber + 1);
    }

    /**
     * 等待最新位置写入后离开；书籍已删除时仍可返回，真实失败时留在正文供重试。
     */
    private async returnToBookshelf(): Promise<void> {
        // 离开与切章互斥，退出流程直接保存当前位置，不等待滚动防抖。
        if (this.chapterLoading || this.returningToBookshelf) return;
        this.returningToBookshelf = true;
        this.contentUi.cancelPendingScroll();

        // 写入失败时保留当前页面；路由已销毁时不重复跳转。
        try {
            const position = this.contentUi.readProgress();
            if (position) await this.updateProgress(position);
            if (!this.signal.aborted) this.onReturnToBookshelf();
        } catch (error) {
            this.returningToBookshelf = false;
            throw error;
        }
    }

    /**
     * 为当前页面注册可随生命周期清理的交互。
     */
    private bindEvent(signal: AbortSignal): void {
        // 移动端切后台或锁屏可能直接冻结页面，不等待路由卸载或防抖计时器。
        bind(
            document,
            "visibilitychange",
            async () => {
                if (document.visibilityState === "hidden") await this.saveReadingPosition();
            },
            { signal }
        );

        // UI 将各输入方式转换为同一切章意图，业务状态决定能否切换工具。
        this.readerUi.bindReadingNavigation(
            (direction) => this.switchChapter(direction),
            () => {
                if (this.chapterLoading || this.returningToBookshelf) return;
                this.readerUi.toggleReadingTools();
            },
            signal
        );

        // 返回先提交进度；全屏切换前后用同一视觉锚点保持阅读位置。
        this.readerUi
            .bindReturnToBookshelf(() => this.returnToBookshelf(), signal)
            .bindToggleFullscreen(async () => {
                if (this.chapterLoading || this.returningToBookshelf) return;
                const position = this.contentUi.readPosition();
                try {
                    await this.appUi.toggleFullscreen();
                } catch (error) {
                    if (signal.aborted) return;
                    throw new OperationError(
                        "无法切换全屏。",
                        "浏览器可能未提供或拒绝了全屏请求，可以继续普通阅读。",
                        error
                    );
                }
                if (signal.aborted) return;
                if (position) this.contentUi.restorePosition(position);
                this.contentUi.dispatchContentScroll();
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

        // 滚动保存只接受稳定正文的位置。
        this.contentUi.bindContentScroll(async (chapterLineNumber, lineVisibleRatio) => {
            if (this.chapterLoading || this.returningToBookshelf || this.appearancePosition) return;
            await this.updateProgress({ chapterLineNumber, lineVisibleRatio });
            if (!this.isActive()) return;
            this.readerUi.renderProgress(
                toBookLineNumber(this.state.chapter, chapterLineNumber),
                numberOfLines(this.state.toc)
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
        bind(
            this.readerUi.root,
            "appearance-open",
            () => {
                this.contentUi.cancelPendingScroll();
                this.appearancePosition = {
                    visual: this.contentUi.readPosition(),
                    progress: this.contentUi.readProgress(),
                };
            },
            { signal }
        );
        bind(
            this.readerUi.root,
            "appearance-close",
            () => {
                const position = this.appearancePosition;
                this.appearancePosition = undefined;
                if (position?.visual) this.contentUi.restorePosition(position.visual);
                this.contentUi.dispatchContentScroll();
            },
            { signal }
        );
    }
}
