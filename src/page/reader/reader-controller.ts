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

import DocUi from "./doc/doc-ui";
import BodyUi from "./body/body-ui";
import Progress from "../../domain/progress/progress";
import ReaderService from "./reader-service";
import HeaderUi from "./header/header-ui";
import ContentUi from "./content/content-ui";
import FooterUi from "./footer/footer-ui";
import SettingUi from "../../component/setting/setting-ui";
import TocUi from "./toc/toc-ui";
import ReaderState from "./reader-state";
import Setting from "../../domain/setting/setting";
import BackgroundColorSettingItem from "../../component/setting/item/background-color-setting-item";
import ColorSettingItem from "../../component/setting/item/color-setting-item";
import WidthSettingItem from "../../component/setting/item/width-setting-item";
import PaddingTopSettingItem from "../../component/setting/item/padding-top-setting-item";
import PaddingLeftSettingItem from "../../component/setting/item/padding-left-setting-item";
import PaddingBottomSettingItem from "../../component/setting/item/padding-bottom-setting-item";
import PaddingRightSettingItem from "../../component/setting/item/padding-right-setting-item";
import FontSizeSettingItem from "../../component/setting/item/font-size-setting-item";
import LineHeightSettingItem from "../../component/setting/item/line-height-setting-item";
import ThemeSettingItem from "../../component/setting/item/theme-setting-item";
import Ui from "../../component/ui";
import SettingItem from "../../component/setting/setting-item";
import SettingState from "../../component/setting/setting-state";
import { UiId } from "../../component/ui-id";
import { SwitchChapterDirection } from "../../constant/switch-chapter-direction";
import { StyleProperty } from "../../component/setting/style-property";
import { assertExists } from "../../util/assert-util";
import { PageName } from "../../constant/page-name";

/**
 * 阅读器控制器
 * @author allurx
 */
export default class ReaderController {
    private readonly docUi: DocUi;
    private readonly bodyUi: BodyUi;
    private readonly headerUi: HeaderUi;
    private readonly contentUi: ContentUi;
    private readonly footerUi: FooterUi;
    private readonly tocUi: TocUi;
    private readonly settingUi: SettingUi;
    private readonly readerService: ReaderService;
    private state!: ReaderState;

    public constructor() {
        this.readerService = new ReaderService();

        this.docUi = new DocUi({
            root: document.documentElement,
            displayName: "网页",
        });
        this.bodyUi = new BodyUi({
            root: document.body,
            displayName: "阅读器",
        });
        this.headerUi = new HeaderUi({
            root: assertExists(document.querySelector<HTMLElement>("#header")),
            displayName: "页眉",
        });
        this.contentUi = new ContentUi({
            root: assertExists(document.querySelector<HTMLElement>("#content")),
            displayName: "正文",
        });
        this.footerUi = new FooterUi({
            root: assertExists(document.querySelector<HTMLElement>("#footer")),
            displayName: "页脚",
        });
        this.tocUi = new TocUi({
            root: assertExists(document.querySelector<HTMLDivElement>("#toc")),
            displayName: "目录",
        });

        this.settingUi = new SettingUi({
            container: this.bodyUi.root,
            uiSettingItemMap: new Map<Ui, (new (settingState: SettingState) => SettingItem)[]>([
                [this.docUi, [BackgroundColorSettingItem, ThemeSettingItem]],
                [this.bodyUi, [ColorSettingItem, WidthSettingItem, BackgroundColorSettingItem]],
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
    public async init(bookId: string) {
        this.state = await this.readerService.init(bookId);

        // 渲染界面
        // 注意这里虽然是先渲染界面然后再绑定事件，但是由于浏览器的渲染机制，
        // render函数内部修改ui导致的ContentScroll和ReaderResize事件会在未来的某一刻被触发，这个时刻无法确定，由浏览器自己决定。
        // 从而导致bindContentScroll和observeReaderResize对应的事件处理函数会在页面首次加载之后某一时刻被调用，
        // 这个无副作用的调用是可以接受的，因为只是重复保存了一下。目前还没有发现可以避免这种情况的好办法

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

        this.settingUi.renderAside().applySetting(this.state.settings);

        // 显示document
        this.docUi.show();

        // 绑定事件
        this.bindEvent();
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
     * 更新设置并保存
     */
    private async updateSetting(uiId: UiId, mergedSetting: Record<string, unknown>) {
        const setting =
            this.state.settings.get(uiId) ??
            new Setting({
                id: crypto.randomUUID(),
                uiId: uiId,
                pageName: PageName.READER,
                createdTime: Date.now(),
                updatedTime: Date.now(),
            });
        Object.assign(setting, mergedSetting);
        setting.updatedTime = Date.now();
        this.state.settings.set(uiId, setting);
        await this.readerService.updateSetting(setting);
    }

    /**
     * 删除阅读器设置
     */
    private async deleteSettings() {
        await this.readerService.deleteSettings();
    }

    /**
     * 切换章节
     * @param  direction - 方向
     */
    private async switchChapter(direction: SwitchChapterDirection) {
        if (direction === SwitchChapterDirection.PREV) {
            if (this.state.progress.chapterIndex === 1) {
                await this.bodyUi.alertDialog("已经是第一章了");
            } else {
                await this.bodyUi.showOverlayWhile(async () => {
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
                await this.bodyUi.alertDialog("已经是最后一章了");
            } else {
                await this.bodyUi.showOverlayWhile(async () => {
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
    private bindEvent() {
        // doc ui事件
        this.docUi.bindChapterNavigation(this.contentUi.root, (direction) => this.switchChapter(direction));

        // reader ui事件
        this.bodyUi.observeReaderResize((width) => this.updateSetting(UiId.READER, { [StyleProperty.WIDTH]: width }));

        // header ui事件
        this.headerUi
            .bindToggleTocPanel(() => {
                this.tocUi.toggleToc().highlightCurrentChapter(this.state.progress.chapterIndex);
            })
            .bindToggleSettingPanel(() => this.settingUi.toggleSetting())
            .bindToggleFullscreen(() => {
                this.docUi
                    .toggleFullscreen()
                    .then(() => this.contentUi.dispatchContentScroll())
                    .catch(async () => await this.bodyUi.alertDialog("当前浏览器不支持全屏功能"));
            });

        // body ui事件
        this.contentUi.bindContentScroll(async (lineIndex, lineVisibleRatio) => {
            await this.updateProgress({ lineIndex, lineVisibleRatio, updatedTime: Date.now() });
            this.footerUi.renderProgress(this.state.chapter.lineNumber(lineIndex), this.state.toc.numberOfLines());
        });

        // toc ui事件
        this.tocUi
            .delegateTocItemClick(async (chapterIndex) => {
                await this.bodyUi.showOverlayWhile(async () => {
                    await this.updateProgress({
                        chapterIndex,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                        updatedTime: Date.now(),
                    });
                    await this.loadChapter();
                });
            })
            .bindTocClose();

        // setting ui事件
        this.settingUi
            .bindNodeClick(this.state.settings)
            .bindCloseSetting()
            .bindResetSetting(async () => {
                this.state.settings.clear();
                await this.deleteSettings();
            })
            .bindSettingItemChange(async (ui, settingItem) => {
                await this.updateSetting(ui.id, settingItem);
            });
    }
}
