/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { run, bind } from "@/utils/event-util";
import AppUi from "./app/app-ui";
import ReaderUi from "./reader-ui";
import type Progress from "@/domain/progress/progress";
import { toBookPosition } from "@/domain/chapter/chapter";
import { numberOfPositions } from "@/domain/toc/toc";
import { initReader, updateProgress, getChapter } from "./reader-service";
import ContentUi from "./content/content-ui";
import type { ReadingSnapshot } from "./content/content-ui";
import TocUi from "./toc/toc-ui";
import type ReaderState from "./reader-state";
import { createReaderSettings } from "@/settings/definitions/setting-catalog";
import SettingController from "@/settings/setting-controller";
import { ReadingDirection } from "./reading-direction";
import { assertExists } from "@/utils/assert-util";
import { PageName } from "@/constants/page-name";
import OperationError from "@/errors/operation-error";
import { DatabaseFormatError } from "@/database/database";

/**
 * 自动离开不可用阅读入口时替换历史；只有书籍已删除才清除阅读上下文。
 */
export type ReaderExitReason = "missing" | "unavailable";

/**
 * 编排按页阅读、连续滚动、目录跳转和进度保存，章节仍是按需加载的领域单元。
 */
export default class ReaderController {
    private readonly appUi: AppUi;
    private readonly readerUi: ReaderUi;
    private readonly contentUi: ContentUi;
    private readonly tocUi: TocUi;
    private readonly settingController: SettingController;
    private state!: ReaderState;
    private signal!: AbortSignal;
    private initialized = false;
    private returningToBookshelf = false;

    /**
     * UI 负责排版与输入归一，控制器只编排书籍、位置和阅读意图。
     */
    public constructor(
        appRoot: HTMLElement,
        readerRoot: HTMLElement,
        private readonly onReturnToBookshelf: (reason?: ReaderExitReason) => void
    ) {
        this.appUi = new AppUi(appRoot);
        this.readerUi = new ReaderUi(readerRoot);
        this.contentUi = new ContentUi(assertExists(readerRoot.querySelector<HTMLElement>("#content")));
        this.tocUi = new TocUi(
            assertExists(readerRoot.querySelector<HTMLDialogElement>("#toc")),
            this.readerUi.tocButton,
            () => this.isActive()
        );
        this.settingController = new SettingController({
            pageName: PageName.READER,
            container: readerRoot,
            opener: this.readerUi.settingButton,
            canOpen: () => this.isActive(),
            settings: createReaderSettings(readerRoot, this.contentUi.root, (mode) => {
                this.contentUi.setMode(mode);
            }),
        });
    }

    /**
     * 首个 await 前恢复设置，当前页及相邻内容准备好后再接受交互。
     */
    public async init(bookId: string, signal: AbortSignal): Promise<void> {
        this.signal = signal;
        signal.addEventListener(
            "abort",
            () => {
                run(() => this.saveReadingPosition());
                this.appUi.cleanup();
            },
            { once: true }
        );
        this.settingController.init(signal);
        this.readerUi.renderReadingMode(this.contentUi.getMode());
        this.readerUi.bindResponsiveControls(signal);
        this.readerUi.bindToolsAppearance(this.settingController.getToolbarBinding(), signal);
        // 初始化失败时也保留页面内的恢复入口，不让书架按钮依赖书籍成功加载。
        this.readerUi.bindReturnToBookshelf(() => this.returnToBookshelf(), signal);

        try {
            const state = await initReader(bookId);
            if (signal.aborted) return;
            if (!state) {
                this.onReturnToBookshelf("missing");
                return;
            }
            // 无法识别的旧进度不猜测为当前源偏移，保留原文件和原记录供用户处理。
            if (!Number.isSafeInteger(state.progress.contentOffset) || state.progress.contentOffset < 0) {
                this.onReturnToBookshelf("unavailable");
                throw new OperationError(
                    "这本书的阅读数据与当前版本不兼容",
                    "当前版本无法识别这本书保存的阅读位置，原有数据尚未改动。",
                    new Error("Unsupported stored reading position"),
                    ["返回书架，导出这本书的原文件。", "确认文件已保存后，删除这本书并重新导入。原阅读进度不会保留。"]
                );
            }
            this.state = state;
            this.readerUi.setBookLabel(state.book.fileName);
            this.tocUi.renderEntries(state.toc.entries);
            this.contentUi.init(
                state.file,
                state.toc.entries.length,
                (number) => getChapter(state.book.fileId, number),
                signal
            );
            const shown = await this.contentUi.showChapter(state.progress.chapterNumber, state.progress);
            if (!this.isActive()) return;
            if (!shown) throw new Error("Stored reading chapter is outside the book");
            this.initialized = true;
            this.renderLocation();
            this.contentUi.bindLocationChange(async (snapshot) => {
                if (!this.isActive()) return;
                this.renderLocation(snapshot);
                await this.updateProgress(snapshot);
            });
            this.bindEvent(signal);
            this.readerUi.enableReadingControls();
        } catch (error) {
            if (error instanceof DatabaseFormatError) {
                if (!signal.aborted) this.onReturnToBookshelf("unavailable");
                return;
            }
            if (!signal.aborted) this.readerUi.showReadingTools();
            if (error instanceof OperationError) throw error;
            throw new OperationError(
                "这本书暂时无法打开",
                "Aura 未能读取或显示这本书的正文。",
                error,
                "请返回书架后重新打开。若仍无法打开，请保留原文件，并展开详细信息查看原因。"
            );
        }
    }

    /**
     * 独立快照直接进入数据库事务队列，后续阅读会话等待此前提交完成再读取位置。
     * 不另建页面级 Promise 队列，避免尚未创建的保存事务被新会话读取越过。
     */
    private async updateProgress(reading: ReadingSnapshot): Promise<void> {
        const snapshot: Progress = {
            bookId: this.state.book.id,
            ...reading.location,
            readingRatio: this.readingRatio(reading),
        };
        let saved: boolean;
        try {
            saved = await updateProgress(snapshot);
        } catch (error) {
            throw new OperationError(
                "阅读位置尚未保存",
                "这次位置未能保存，重新打开时可能回到之前的位置。",
                error,
                "请先记下当前章节和位置，处理失败原因后再尝试返回书架。"
            );
        }
        if (saved) this.state.progress = snapshot;
        else if (this.isActive()) {
            this.returningToBookshelf = true;
            this.contentUi.cancelPendingScroll();
            this.onReturnToBookshelf("missing");
        }
    }

    /**
     * 退出或切后台立即保存正文维护的稳定源位置。
     */
    private async saveReadingPosition(): Promise<void> {
        if (!this.initialized || this.returningToBookshelf) return;
        this.contentUi.cancelPendingScroll();
        const snapshot = this.contentUi.readSnapshot();
        if (snapshot) await this.updateProgress(snapshot);
        if (this.isActive()) this.renderLocation();
    }

    /**
     * 页内移动优先，越过边界才接续相邻章；内容提交后可接续翻页，不排队播放动画。
     */
    private async turn(direction: ReadingDirection): Promise<void> {
        if (!this.canNavigate()) return;
        if (await this.contentUi.turn(direction)) this.readerUi.hideReadingTools();
    }

    /**
     * 目录及显式切章进入章首，与日常翻页回退到章末的语义分开。
     */
    private async selectChapter(chapterNumber: number): Promise<boolean> {
        if (!this.canNavigate() || chapterNumber < 1 || chapterNumber > this.state.toc.entries.length) return false;
        const selected = await this.contentUi.showChapter(chapterNumber, "start");
        return selected && this.isActive();
    }

    /**
     * 按同一份可见内容同步章名、目录、页码和全书进度。
     */
    private renderLocation(snapshot: ReadingSnapshot | undefined = this.contentUi.readSnapshot()): void {
        if (!snapshot) return;
        const { location, chapter } = snapshot;
        this.readerUi.renderReadingMode(snapshot.mode);
        this.readerUi.renderPageInfo(snapshot.pageNumber, snapshot.pageCount);
        this.readerUi.renderChapterInfo(chapter.title, this.readingRatio(snapshot));
        this.tocUi.highlightCurrentChapter(location.chapterNumber);
    }

    /**
     * 按同一可见快照计算展示比例；非空书的末屏已覆盖书尾，空书保持零。
     */
    private readingRatio(snapshot: ReadingSnapshot): number {
        const count = numberOfPositions(this.state.toc);
        if (count === 0) return 0;
        if (!snapshot.canNext) return 1;
        const { chapter, location } = snapshot;
        return Math.min(1, Math.max(0, toBookPosition(chapter, location.blockNumber, location.contentOffset) / count));
    }

    /**
     * 生命周期与业务互斥不依赖具体控件或面板 DOM。
     */
    private isActive(): boolean {
        return !this.signal.aborted && !this.returningToBookshelf;
    }

    /**
     * 导航不能与已有导航或相邻章节替换并行。
     */
    private canNavigate(): boolean {
        return this.isActive() && !this.contentUi.isBusy();
    }

    /**
     * 返回前保存当前位置；真实失败保留页面，允许重试。
     */
    private async returnToBookshelf(): Promise<void> {
        if (!this.initialized) {
            this.onReturnToBookshelf();
            return;
        }
        // 退出保存当前稳定源位置，不等待分页索引或正在准备的下一页。
        if (!this.isActive()) return;
        const snapshot = this.contentUi.readSnapshot();
        this.returningToBookshelf = true;
        this.contentUi.cancelPendingScroll();
        try {
            if (snapshot) await this.updateProgress(snapshot);
            if (!this.signal.aborted) this.onReturnToBookshelf();
        } catch (error) {
            this.returningToBookshelf = false;
            if (this.isActive()) this.renderLocation();
            throw error;
        }
    }

    /**
     * 绑定当前阅读会话的输入、面板、后台保存与内容链接。
     */
    private bindEvent(signal: AbortSignal): void {
        bind(
            document,
            "visibilitychange",
            async () => {
                if (document.visibilityState === "hidden") await this.saveReadingPosition();
            },
            { signal }
        );

        this.readerUi.bindReadingNavigation(
            {
                onTurn: (direction) => this.turn(direction),
                onDragStart: () => this.canNavigate() && this.contentUi.beginPageDrag(),
                onDragMove: (offset) => {
                    this.contentUi.updatePageDrag(offset);
                },
                onDragEnd: async (commit) => {
                    if (await this.contentUi.endPageDrag(commit)) this.readerUi.hideReadingTools();
                },
                onDragCancel: () => {
                    this.contentUi.cancelPageDrag();
                },
                onChapter: async (direction) => {
                    const selected = await this.selectChapter(
                        (this.contentUi.readProgress()?.chapterNumber ?? this.state.progress.chapterNumber) +
                            (direction === ReadingDirection.PREV ? -1 : 1)
                    );
                    if (selected) this.readerUi.hideReadingTools();
                },
                onCenterTap: () => {
                    if (this.canNavigate()) this.readerUi.toggleReadingTools();
                },
                getMode: () => this.contentUi.getMode(),
            },
            signal
        );

        this.readerUi.bindToggleFullscreen(async () => {
            if (!this.canNavigate()) return;
            try {
                await this.appUi.toggleFullscreen();
            } catch (error) {
                if (signal.aborted) return;
                throw new OperationError(
                    "未能切换全屏",
                    "浏览器没有完成这次全屏请求。",
                    error,
                    "可以继续普通阅读，也可以关闭提示后再次尝试全屏。"
                );
            }
        }, signal);

        this.contentUi.bindBookLinks(async (path, fragment) => {
            if (!this.canNavigate()) return;
            const target = this.state.toc.entries.find(
                (entry) => entry.path === path && (!fragment || entry.anchors?.includes(fragment))
            );
            if (!target)
                throw new OperationError(
                    "书内链接的目标不存在",
                    "这条链接指向的内容在书中不存在，阅读位置没有改变。",
                    new Error(`Missing EPUB link target: ${path}#${fragment}`),
                    "关闭提示后可继续阅读，或从目录查找相关内容。"
                );
            if (await this.contentUi.showChapter(target.chapterNumber, { fragment })) this.readerUi.hideReadingTools();
        }, signal);

        this.tocUi
            .delegateTocItemClick((chapterNumber) => this.selectChapter(chapterNumber), signal)
            .bindTocClose(
                (selected) => {
                    if (selected) this.readerUi.resumeReading();
                },
                signal,
                this.settingController.getPanelFrame("toc")
            );
    }
}
