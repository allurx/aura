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

import AppUi from "./app/app-ui";
import ReaderUi from "./reader-ui";
import Progress from "@/domain/progress/progress";
import ReaderService from "./reader-service";
import HeaderUi from "./header/header-ui";
import ContentUi from "./content/content-ui";
import FooterUi from "./footer/footer-ui";
import TocUi from "./toc/toc-ui";
import ReaderState from "./reader-state";
import BackgroundColorSettingItem from "@/component/setting/item/background-color-setting-item";
import ColorSettingItem from "@/component/setting/item/color-setting-item";
import WidthSettingItem from "@/component/setting/item/width-setting-item";
import PaddingTopSettingItem from "@/component/setting/item/padding-top-setting-item";
import PaddingLeftSettingItem from "@/component/setting/item/padding-left-setting-item";
import PaddingBottomSettingItem from "@/component/setting/item/padding-bottom-setting-item";
import PaddingRightSettingItem from "@/component/setting/item/padding-right-setting-item";
import FontSizeSettingItem from "@/component/setting/item/font-size-setting-item";
import LineHeightSettingItem from "@/component/setting/item/line-height-setting-item";
import ThemeSettingItem from "@/component/setting/item/theme-setting-item";
import Ui from "@/component/ui";
import { UiId } from "@/component/ui-id";
import { SwitchChapterDirection } from "@/constant/switch-chapter-direction";
import { StyleProperty } from "@/component/setting/style-property";
import { assertExists } from "@/util/assert-util";
import { PageName } from "@/constant/page-name";
import SettingController, { type SettingItemConstructor } from "@/component/setting/setting-controller";

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

    public constructor(appRoot: HTMLElement, readerRoot: HTMLElement) {
        this.readerService = new ReaderService();

        this.appUi = new AppUi({
            root: appRoot,
            displayName: "应用",
        });
        this.readerUi = new ReaderUi({
            root: readerRoot,
            displayName: "阅读器",
        });
        this.headerUi = new HeaderUi({
            root: assertExists(readerRoot.querySelector<HTMLElement>("#header")),
            displayName: "页眉",
        });
        this.contentUi = new ContentUi({
            root: assertExists(readerRoot.querySelector<HTMLElement>("#content")),
            displayName: "正文",
        });
        this.footerUi = new FooterUi({
            root: assertExists(readerRoot.querySelector<HTMLElement>("#footer")),
            displayName: "页脚",
        });
        this.tocUi = new TocUi({
            root: assertExists(readerRoot.querySelector<HTMLElement>("#toc")),
            displayName: "目录",
        });

        this.settingController = new SettingController({
            pageName: PageName.READER,
            container: this.readerUi.root,
            uiSettingItemMap: new Map<Ui, readonly SettingItemConstructor[]>([
                [this.appUi, [BackgroundColorSettingItem, ThemeSettingItem]],
                [this.readerUi, [ColorSettingItem, WidthSettingItem, BackgroundColorSettingItem]],
                [
                    this.headerUi,
                    [
                        PaddingTopSettingItem,
                        PaddingLeftSettingItem,
                        PaddingBottomSettingItem,
                        PaddingRightSettingItem,
                        BackgroundColorSettingItem,
                    ],
                ],
                [
                    this.contentUi,
                    [
                        FontSizeSettingItem,
                        ColorSettingItem,
                        PaddingLeftSettingItem,
                        PaddingRightSettingItem,
                        BackgroundColorSettingItem,
                        LineHeightSettingItem,
                    ],
                ],
                [
                    this.footerUi,
                    [
                        FontSizeSettingItem,
                        ColorSettingItem,
                        PaddingTopSettingItem,
                        PaddingBottomSettingItem,
                        PaddingLeftSettingItem,
                        PaddingRightSettingItem,
                        BackgroundColorSettingItem,
                    ],
                ],
                [this.tocUi, [FontSizeSettingItem, ColorSettingItem, BackgroundColorSettingItem]],
            ]),
        });
    }

    /**
     * 初始化阅读器
     * @param bookId - 书籍id
     */
    public async init(bookId: string, signal: AbortSignal): Promise<void> {
        signal.addEventListener(
            "abort",
            () => {
                this.appUi.cleanup();
            },
            { once: true }
        );

        const [state] = await Promise.all([this.readerService.init(bookId), this.settingController.init(signal)]);
        if (signal.aborted) return;

        this.state = state;

        // restoreProgress 触发的 scroll 可能延迟到事件绑定之后，产生一次等值的进度保存。

        this.tocUi.renderContents(this.state.toc.contents);

        this.contentUi
            .renderChapter(this.state.chapter.lines)
            .restoreProgress(this.state.progress.lineIndex, this.state.progress.lineVisibleRatio);

        this.footerUi
            .renderChapterTitle(this.state.chapter.title)
            .renderProgress(
                this.state.chapter.lineNumber(this.state.progress.lineIndex),
                this.state.toc.numberOfLines()
            );

        // 显示阅读器内容
        this.readerUi.show();

        // 绑定事件
        this.bindEvent(signal);
    }

    /**
     * 加载章节
     */
    private async loadChapter() {
        // 获取章节数据
        this.state.chapter = await this.readerService.getChapter(
            this.state.book.fileId,
            this.state.progress.chapterIndex
        );

        // 渲染正文
        this.contentUi
            .renderChapter(this.state.chapter.lines)
            .restoreProgress(this.state.progress.lineIndex, this.state.progress.lineVisibleRatio);

        // 渲染底部信息
        this.footerUi
            .renderChapterTitle(this.state.chapter.title)
            .renderProgress(
                this.state.chapter.lineNumber(this.state.progress.lineIndex),
                this.state.toc.numberOfLines()
            );

        // 高亮当前章节
        this.tocUi.highlightCurrentChapter(this.state.progress.chapterIndex);
    }

    /**
     * 更新阅读进度
     * @param progress - 阅读进度对象
     */
    private async updateProgress(progress: Partial<Progress>) {
        this.state.progress.update(progress);
        await this.readerService.updateProgress(this.state.progress);
    }

    /**
     * 切换章节
     * @param  direction - 方向
     */
    private async switchChapter(direction: SwitchChapterDirection) {
        if (direction === SwitchChapterDirection.PREV) {
            if (this.state.progress.chapterIndex === 1) {
                await this.readerUi.alertDialog("已经是第一章了");
            } else {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.updateProgress({
                        chapterIndex: this.state.progress.chapterIndex - 1,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                        updatedTime: Date.now(),
                    });
                    await this.loadChapter();
                });
            }
        } else if (direction === SwitchChapterDirection.NEXT) {
            if (this.state.progress.chapterIndex === this.state.toc.numberOfChapters()) {
                await this.readerUi.alertDialog("已经是最后一章了");
            } else {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.updateProgress({
                        chapterIndex: this.state.progress.chapterIndex + 1,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                        updatedTime: Date.now(),
                    });
                    await this.loadChapter();
                });
            }
        }
    }

    /**
     * 绑定ui事件
     */
    private bindEvent(signal: AbortSignal): void {
        // App UI 事件
        this.appUi.bindChapterNavigation(this.contentUi.root, (direction) => this.switchChapter(direction), signal);

        // Reader UI 事件
        this.readerUi.observePreferredWidth(async (width) => {
            if (this.settingController.isPreviewing(this.readerUi, StyleProperty.WIDTH)) return;
            if (this.settingController.getValue(UiId.READER, StyleProperty.WIDTH) === width) return;

            await this.settingController.commitExternal(this.readerUi, {
                key: StyleProperty.WIDTH,
                value: width,
            });
        }, signal);

        // header ui事件
        this.headerUi
            .bindToggleTocPanel(() => {
                this.tocUi.toggleToc().highlightCurrentChapter(this.state.progress.chapterIndex);
            }, signal)
            .bindToggleSettingPanel(() => this.settingController.toggle(), signal)
            .bindToggleFullscreen(() => {
                this.appUi
                    .toggleFullscreen()
                    .then(() => this.contentUi.dispatchContentScroll())
                    .catch(async () => await this.readerUi.alertDialog("当前浏览器不支持全屏功能"));
            }, signal);

        // Reader UI 事件
        this.contentUi.bindContentScroll(async (lineIndex, lineVisibleRatio) => {
            await this.updateProgress({ lineIndex, lineVisibleRatio, updatedTime: Date.now() });
            this.footerUi.renderProgress(this.state.chapter.lineNumber(lineIndex), this.state.toc.numberOfLines());
        }, signal);

        // toc ui事件
        this.tocUi
            .delegateTocItemClick(async (chapterIndex) => {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.updateProgress({
                        chapterIndex,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                        updatedTime: Date.now(),
                    });
                    await this.loadChapter();
                });
            }, signal)
            .bindTocClose(signal);

    }
}
