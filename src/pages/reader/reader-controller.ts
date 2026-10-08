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
import type { ReadingLocation, ReadingPosition, ReadingSnapshot } from "./content/content-ui";
import TocUi from "./toc/toc-ui";
import type ReaderState from "./reader-state";
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
    private state!: ReaderState;
    private signal!: AbortSignal;
    private initialized = false;
    private returningToBookshelf = false;
    private appearancePosition: ReadingPosition | undefined;
    private progressWrite: Promise<void> = Promise.resolve();

    /**
     * UI 负责排版与输入归一，控制器只编排书籍、位置和阅读意图。
     */
    public constructor(
        appRoot: HTMLElement,
        readerRoot: HTMLElement,
        private readonly onReturnToBookshelf: (missingBook?: boolean) => void
    ) {
        this.appUi = new AppUi(appRoot);
        this.readerUi = new ReaderUi(readerRoot);
        this.contentUi = new ContentUi(assertExists(readerRoot.querySelector<HTMLElement>("#content")));
        this.tocUi = new TocUi(assertExists(readerRoot.querySelector<HTMLDialogElement>("#toc")));
        this.settingController = new SettingController({
            pageName: PageName.READER,
            container: readerRoot,
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
        this.readerUi.bindResponsiveControls(signal);
        // 初始化失败时也保留页面内的恢复入口，不让书架按钮依赖书籍成功加载。
        this.readerUi.bindReturnToBookshelf(() => this.returnToBookshelf(), signal);

        try {
            const state = await initReader(bookId);
            if (signal.aborted) return;
            if (!state) {
                this.onReturnToBookshelf(true);
                return;
            }
            // 旧进度使用排版比例，不能解释为当前源偏移；按项目约定提示重置，不做隐式迁移。
            if (!Number.isSafeInteger(state.progress.contentOffset) || state.progress.contentOffset < 0) {
                this.onReturnToBookshelf();
                throw new OperationError(
                    "这本书的阅读数据与当前版本不兼容",
                    "此版本更新了阅读位置结构，旧位置不会自动转换。",
                    new Error("Unsupported stored reading position"),
                    "请先从书架导出需要保留的原文件，再重置数据并重新导入。"
                );
            }
            this.state = state;
            this.readerUi.renderBookTitle(state.book.fileName);
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
                if (!this.appearancePosition) await this.updateProgress(snapshot.location);
            });
            this.bindEvent(signal);
        } catch (error) {
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
            this.onReturnToBookshelf(true);
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
        if (await this.contentUi.turn(direction)) this.readerUi.hideReadingTools();
    }

    /**
     * 目录及显式切章进入章首，与日常翻页回退到章末的语义分开。
     */
    private async selectChapter(chapterNumber: number): Promise<boolean> {
        if (!this.canNavigate() || chapterNumber < 1 || chapterNumber > this.state.toc.entries.length) return false;
        const selected = await this.contentUi.showChapter(chapterNumber, "start");
        if (selected && this.isActive()) this.readerUi.hideReadingTools();
        return selected && this.isActive();
    }

    /**
     * 按同一份可见内容同步章名、目录、页码和全书进度。
     */
    private renderLocation(snapshot: ReadingSnapshot | undefined = this.contentUi.readSnapshot()): void {
        if (!snapshot) return;
        const { location, chapter } = snapshot;
        this.readerUi.renderNavigation(snapshot);
        this.readerUi.renderPageInfo(snapshot.pageNumber, snapshot.pageCount);
        const count = numberOfPositions(this.state.toc);
        this.readerUi.renderChapterInfo(
            chapter.title,
            snapshot.canNext ? toBookPosition(chapter, location.blockNumber, location.contentOffset) : count,
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
                onChapter: async (direction) => {
                    await this.selectChapter(
                        (this.contentUi.readProgress()?.chapterNumber ?? this.state.progress.chapterNumber) +
                            (direction === ReadingDirection.PREV ? -1 : 1)
                    );
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
            const position = this.contentUi.readPosition();
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
            if (signal.aborted) return;
            if (position) this.contentUi.restorePosition(position);
            await this.contentUi.refreshLocation();
        }, signal);

        this.readerUi
            .bindToggleSettingPanel((opener) => {
                if (this.canNavigate()) this.settingController.toggle(opener);
            }, signal)
            .bindToggleTocPanel(() => {
                if (!this.canNavigate()) return;
                this.readerUi.setTocExpanded(this.tocUi.toggleToc());
            }, signal);

        this.contentUi.bindBookLinks(async (path, fragment) => {
            if (!this.canNavigate()) return;
            const target = this.state.toc.entries.find(
                (entry) => entry.path === path && (!fragment || entry.anchors?.includes(fragment))
            );
            if (!target) return;
            if (await this.contentUi.showChapter(target.chapterNumber, { fragment })) this.readerUi.hideReadingTools();
        }, signal);

        this.tocUi
            .delegateTocItemClick((chapterNumber) => this.selectChapter(chapterNumber), signal)
            .bindTocClose((selected) => {
                this.readerUi.setTocExpanded(false);
                if (selected) {
                    this.readerUi.hideReadingTools();
                    this.contentUi.root.focus({ preventScroll: true });
                }
                run(() => this.contentUi.refreshLocation());
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
            async () => {
                const position = this.appearancePosition;
                this.appearancePosition = undefined;
                if (position) this.contentUi.restorePosition(position);
                await this.contentUi.refreshLocation();
            },
            { signal }
        );
    }
}
