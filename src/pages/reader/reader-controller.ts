/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { run, bind } from "@/utils/event-util";
import AppUi from "./app/app-ui";
import ReaderUi from "./reader-ui";
import type Progress from "@/domain/progress/progress";
import type Chapter from "@/domain/chapter/chapter";
import { toBookPosition } from "@/domain/chapter/chapter";
import { numberOfPositions } from "@/domain/toc/toc";
import { initReader, updateProgress, getChapter } from "./reader-service";
import ContentUi from "./content/content-ui";
import type { ReadingLocation, ReadingPosition } from "./content/content-ui";
import TocUi from "./toc/toc-ui";
import type ReaderState from "./reader-state";
import type { ReadingMode } from "./reading-mode";
import { createReaderSettings } from "@/settings/definitions/setting-catalog";
import SettingController from "@/settings/setting-controller";
import { ReadingDirection } from "./reading-direction";
import { assertExists } from "@/utils/assert-util";
import { PageName } from "@/constants/page-name";
import OperationError from "@/errors/operation-error";

/**
 * 编排按页阅读、连续滚动、目录跳转和进度保存，章节仍是按需加载的领域单元。
 */
export default class ReaderController {
    private readonly appUi: AppUi;
    private readonly readerUi: ReaderUi;
    private readonly contentUi: ContentUi;
    private readonly tocUi: TocUi;
    private readonly settingController: SettingController;
    private readonly chapters = new Map<number, Chapter>();
    private state!: ReaderState;
    private signal!: AbortSignal;
    private initialized = false;
    private navigating = false;
    private updatingWindow = false;
    private returningToBookshelf = false;
    private windowCenter = 1;
    private mode: ReadingMode = "cover";
    private appearancePosition: ReadingPosition | undefined;
    private progressWrite: Promise<void> = Promise.resolve();

    /**
     * UI 负责排版与输入归一，控制器只编排书籍、位置和阅读意图。
     */
    public constructor(
        appRoot: HTMLElement,
        readerRoot: HTMLElement,
        private readonly onReturnToBookshelf: () => void
    ) {
        this.appUi = new AppUi(appRoot);
        this.readerUi = new ReaderUi(readerRoot);
        this.contentUi = new ContentUi(assertExists(readerRoot.querySelector<HTMLElement>("#content")));
        this.tocUi = new TocUi(assertExists(readerRoot.querySelector<HTMLDialogElement>("#toc")));
        this.settingController = new SettingController({
            pageName: PageName.READER,
            container: readerRoot,
            settings: createReaderSettings(readerRoot, this.contentUi.root, (mode) => {
                this.mode = mode;
                this.contentUi.setMode(mode);
                if (this.initialized) this.renderLocation();
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
        this.readerUi.bindResponsiveControls(signal);

        const state = await initReader(bookId);
        if (signal.aborted) return;
        // 旧进度使用排版比例，不能解释为当前源偏移；按项目约定提示重置，不做隐式迁移。
        if (!Number.isSafeInteger(state.progress.contentOffset) || state.progress.contentOffset < 0) {
            this.onReturnToBookshelf();
            throw new OperationError(
                "阅读数据需要重置。",
                "此版本更新了阅读位置结构。请先从书架导出需要保留的原文件，再重置数据并重新导入。旧位置不会自动转换。",
                new Error("Unsupported stored reading position")
            );
        }
        this.state = state;
        this.chapters.set(state.chapter.chapterNumber, state.chapter);
        this.readerUi.renderBookTitle(state.book.fileName);
        this.tocUi.renderEntries(state.toc.entries);
        this.contentUi.init(state.file, signal);
        const chapters = await this.loadWindow(state.progress.chapterNumber);
        if (!this.isActive()) return;
        await this.contentUi.showChapter(chapters, state.progress.chapterNumber, state.progress);
        if (!this.isActive()) return;
        this.windowCenter = state.progress.chapterNumber;
        this.initialized = true;
        this.renderLocation();
        this.bindEvent(signal);
    }

    /**
     * 只加载当前位置及前后一章，复用已有数据；窗口外数据由 trimChapters 释放。
     */
    private async loadWindow(chapterNumber: number): Promise<Chapter[]> {
        const numbers = [chapterNumber - 1, chapterNumber, chapterNumber + 1].filter(
            (number) => number >= 1 && number <= this.state.toc.entries.length
        );
        const chapters = await Promise.all(
            numbers.map(async (number) => {
                const chapter = this.chapters.get(number) ?? (await getChapter(this.state.book.fileId, number));
                return chapter;
            })
        );
        if (this.isActive()) for (const chapter of chapters) this.chapters.set(chapter.chapterNumber, chapter);
        return chapters;
    }

    /**
     * 内容和数据保留相同范围，不能因读完很多章节而累计整本书。
     */
    private trimChapters(chapterNumber: number): void {
        for (const number of this.chapters.keys()) {
            if (Math.abs(number - chapterNumber) > 1) this.chapters.delete(number);
        }
    }

    /**
     * 独立快照按提交顺序写入，删除中的书籍不重新创建孤儿进度。
     */
    private async updateProgress(location: ReadingLocation): Promise<void> {
        const snapshot: Progress = { bookId: this.state.book.id, ...location };
        const write = this.progressWrite.then(() => updateProgress(snapshot));
        this.progressWrite = write.then(
            () => undefined,
            () => undefined
        );
        let saved: boolean;
        try {
            saved = await write;
        } catch (error) {
            throw new OperationError(
                "阅读位置未能保存。",
                "当前正文仍可阅读，但这次位置尚未保存。请检查浏览器存储状态，再尝试返回书架。",
                error
            );
        }
        if (saved) this.state.progress = snapshot;
        else if (this.isActive()) {
            this.returningToBookshelf = true;
            this.contentUi.cancelPendingScroll();
            this.onReturnToBookshelf();
        }
    }

    /**
     * 退出或切后台立即保存；外观预览期间保存调整前的源位置。
     */
    private async saveReadingPosition(): Promise<void> {
        if (!this.initialized || this.returningToBookshelf) return;
        this.contentUi.cancelPendingScroll();
        const location = this.appearancePosition?.location ?? this.contentUi.readProgress();
        if (location) await this.updateProgress(location);
        if (this.isActive()) this.renderLocation();
    }

    /**
     * 页内移动优先，越过边界才接续相邻章；动画中的重复输入不排成长队。
     */
    private async turn(direction: ReadingDirection): Promise<void> {
        if (!this.canNavigate()) return;
        this.navigating = true;
        this.contentUi.cancelPendingScroll();
        try {
            if (!(await this.contentUi.turn(direction))) {
                const current = this.contentUi.readProgress()?.chapterNumber ?? this.state.progress.chapterNumber;
                const chapterNumber = current + (direction === ReadingDirection.NEXT ? 1 : -1);
                if (chapterNumber < 1 || chapterNumber > this.state.toc.entries.length) return;
                await this.showChapter(chapterNumber, direction === ReadingDirection.PREV ? "end" : "start", direction);
            }
            if (!this.isActive()) return;
            const location = this.contentUi.readProgress();
            this.readerUi.hideReadingTools();
            this.renderLocation();
            if (location) await this.updateProgress(location);
        } finally {
            this.navigating = false;
        }
        if (this.mode === "scroll") this.contentUi.dispatchContentScroll();
    }

    /**
     * 目录及显式切章进入章首，与日常翻页回退到章末的语义分开。
     */
    private async selectChapter(chapterNumber: number): Promise<void> {
        if (!this.canNavigate() || chapterNumber < 1 || chapterNumber > this.state.toc.entries.length) return;
        this.navigating = true;
        this.contentUi.cancelPendingScroll();
        try {
            const oldPosition = this.contentUi.readProgress();
            if (oldPosition) await this.updateProgress(oldPosition);
            if (!this.isActive()) return;
            await this.showChapter(chapterNumber, "start");
            if (!this.isActive()) return;
            const position = this.contentUi.readProgress();
            this.renderLocation();
            if (position) await this.updateProgress(position);
            if (this.isActive()) {
                this.readerUi.hideReadingTools();
            }
        } finally {
            this.navigating = false;
        }
    }

    /**
     * 准备相邻章后提交正文，数据加载失败时保留原来可读的页面。
     */
    private async showChapter(
        chapterNumber: number,
        target: "start" | "end",
        direction = ReadingDirection.INVALID
    ): Promise<void> {
        const chapters = await this.loadWindow(chapterNumber);
        if (!this.isActive()) return;
        await this.contentUi.showChapter(chapters, chapterNumber, target, direction);
        if (!this.isActive()) return;
        this.windowCenter = chapterNumber;
        this.trimChapters(chapterNumber);
    }

    /**
     * 滚动自然跨章后更新位置和有限窗口，更新期间的输入由浏览器继续处理。
     */
    private async onContentScroll(location: ReadingLocation): Promise<void> {
        if (this.navigating || this.updatingWindow || this.returningToBookshelf || this.appearancePosition) return;
        this.updatingWindow = true;
        try {
            this.renderLocation();
            await this.updateProgress(location);
            if (!this.isActive()) return;
            if (this.mode === "scroll" && location.chapterNumber !== this.windowCenter) {
                const chapters = await this.loadWindow(location.chapterNumber);
                if (!this.isActive()) return;
                await this.contentUi.updateWindow(chapters, location.chapterNumber);
                if (!this.isActive()) return;
                if (this.contentUi.readProgress()?.chapterNumber === location.chapterNumber) {
                    this.windowCenter = location.chapterNumber;
                    this.trimChapters(location.chapterNumber);
                }
            }
            this.renderLocation();
        } finally {
            this.updatingWindow = false;
        }
        const current = this.contentUi.readProgress();
        if (
            current &&
            (current.chapterNumber !== location.chapterNumber ||
                current.blockNumber !== location.blockNumber ||
                current.contentOffset !== location.contentOffset)
        )
            this.contentUi.dispatchContentScroll();
    }

    /**
     * 按同一份可见内容同步章名、目录、页码和全书进度。
     */
    private renderLocation(): void {
        const location = this.contentUi.readProgress();
        if (!location) return;
        const chapter = this.chapters.get(location.chapterNumber);
        if (!chapter) return;
        this.state.chapter = chapter;
        const navigation = this.contentUi.navigation(this.state.toc.entries.length);
        this.readerUi.renderNavigation({ ...navigation, mode: this.mode });
        this.readerUi.renderPageInfo(navigation.pageNumber, navigation.pageCount);
        const count = numberOfPositions(this.state.toc);
        this.readerUi.renderChapterInfo(
            chapter.title,
            navigation.canNext ? toBookPosition(chapter, location.blockNumber, location.contentOffset) : count,
            count
        );
        this.tocUi.highlightCurrentChapter(location.chapterNumber);
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
        return this.isActive() && !this.navigating && !this.updatingWindow;
    }

    /**
     * 返回前保存当前位置；真实失败保留页面，允许重试。
     */
    private async returnToBookshelf(): Promise<void> {
        if (!this.canNavigate()) return;
        const position = this.contentUi.readProgress();
        this.returningToBookshelf = true;
        this.contentUi.cancelPendingScroll();
        try {
            if (position) await this.updateProgress(position);
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
                onChapter: (direction) =>
                    this.selectChapter(
                        (this.contentUi.readProgress()?.chapterNumber ?? this.state.progress.chapterNumber) +
                            (direction === ReadingDirection.PREV ? -1 : 1)
                    ),
                onCenterTap: () => {
                    if (this.canNavigate()) this.readerUi.toggleReadingTools();
                },
                getMode: () => this.mode,
            },
            signal
        );

        this.readerUi
            .bindReturnToBookshelf(() => this.returnToBookshelf(), signal)
            .bindToggleFullscreen(async () => {
                if (!this.canNavigate()) return;
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

        this.readerUi
            .bindToggleSettingPanel((opener) => {
                if (this.canNavigate()) this.settingController.toggle(opener);
            }, signal)
            .bindToggleTocPanel(() => {
                if (!this.canNavigate()) return;
                this.readerUi.setTocExpanded(this.tocUi.toggleToc());
            }, signal);

        this.contentUi.bindContentScroll((location) => this.onContentScroll(location), signal);
        this.contentUi.bindBookLinks(async (path, fragment) => {
            if (!this.canNavigate()) return;
            const target = this.state.toc.entries.find(
                (entry) => entry.path === path && (!fragment || entry.anchors?.includes(fragment))
            );
            if (!target) return;
            await this.selectChapter(target.chapterNumber);
            if (this.isActive() && this.state.progress.chapterNumber === target.chapterNumber) {
                this.contentUi.scrollToFragment(fragment);
                await this.saveReadingPosition();
            }
        }, signal);

        this.tocUi
            .delegateTocItemClick((chapterNumber) => this.selectChapter(chapterNumber), signal)
            .bindTocClose((selected) => {
                this.readerUi.setTocExpanded(false);
                if (selected) {
                    this.readerUi.hideReadingTools();
                    this.contentUi.root.focus({ preventScroll: true });
                }
                this.contentUi.dispatchContentScroll();
            }, signal);

        // 设置预览冻结源位置；关闭后恢复同一内容，分页与滚动互换也使用同一锚点。
        bind(
            this.readerUi.root,
            "appearance-open",
            () => {
                this.contentUi.cancelPendingScroll();
                this.appearancePosition = this.contentUi.readPosition();
            },
            { signal }
        );
        bind(
            this.readerUi.root,
            "appearance-close",
            () => {
                const position = this.appearancePosition;
                this.appearancePosition = undefined;
                if (position) this.contentUi.restorePosition(position);
                this.contentUi.dispatchContentScroll();
            },
            { signal }
        );
    }
}
