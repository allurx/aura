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

import DocUi from "./doc/doc.ui";
import ReaderUi from "./reader.ui";
import ReadingProgress from "../../domain/reading-progress/reading-progress.model";
import ReaderService from "./reader.service";
import HeaderUi from "./header/header.ui";
import BodyUi from "./body/body.ui";
import FooterUi from "./footer/footer.ui";
import SettingUi from "./setting/setting.ui";
import TocUi from "./toc/toc.ui";
import { SwitchChapterDirection } from "../../core/constant/switch-chapter-direction";
import ReaderState from "./reader.state";
import { SettingName } from "../../core/constant/setting.name";
import { ConfigurableStyleProperty } from "../../core/component/constant/configurable.style.property";
import ReaderSetting from "../../domain/setting/reader-setting.model";
import { assertExists } from "../../core/util/assert.util";

/**
 * 阅读器控制器
 * @author allurx
 */
export default class ReaderController {
    private readonly docUi: DocUi;
    private readonly readerUi: ReaderUi;
    private readonly headerUi: HeaderUi;
    private readonly bodyUi: BodyUi;
    private readonly footerUi: FooterUi;
    private readonly settingUi: SettingUi;
    private readonly tocUi: TocUi;
    private readonly readerService: ReaderService;
    private state!: ReaderState;

    public constructor() {
        this.readerService = new ReaderService();

        this.docUi = new DocUi({
            root: document.documentElement,
            settingName: SettingName.READER_DOC,
            displayName: "网页",
            configurableStyleProperties: new Set<ConfigurableStyleProperty>([
                ConfigurableStyleProperty.BACKGROUND_COLOR,
            ]),
        });
        this.readerUi = new ReaderUi({
            root: assertExists(document.querySelector<HTMLDivElement>("#reader")),
            settingName: SettingName.READER,
            displayName: "阅读器",
            dialog: this.docUi.dialog,
            configurableStyleProperties: new Set<ConfigurableStyleProperty>([
                ConfigurableStyleProperty.FONT_SIZE,
                ConfigurableStyleProperty.COLOR,
                ConfigurableStyleProperty.WIDTH,
                ConfigurableStyleProperty.LINE_HEIGHT,
                ConfigurableStyleProperty.BACKGROUND_COLOR,
            ]),
        });
        this.headerUi = new HeaderUi({
            root: assertExists(document.querySelector<HTMLElement>("#header")),
            settingName: SettingName.READER_HEADER,
            displayName: "页眉",
            dialog: this.readerUi.dialog,
            overlay: this.readerUi.overlay,
            configurableStyleProperties: new Set<ConfigurableStyleProperty>([
                ConfigurableStyleProperty.FONT_SIZE,
                ConfigurableStyleProperty.COLOR,
                ConfigurableStyleProperty.PADDING_TOP,
                ConfigurableStyleProperty.PADDING_BOTTOM,
                ConfigurableStyleProperty.PADDING_LEFT,
                ConfigurableStyleProperty.PADDING_RIGHT,
                ConfigurableStyleProperty.BACKGROUND_COLOR,
            ]),
        });
        this.bodyUi = new BodyUi({
            root: assertExists(document.querySelector<HTMLElement>("#content")),
            settingName: SettingName.READER_CONTENT,
            displayName: "正文",
            dialog: this.readerUi.dialog,
            overlay: this.readerUi.overlay,
            configurableStyleProperties: new Set<ConfigurableStyleProperty>([
                ConfigurableStyleProperty.FONT_SIZE,
                ConfigurableStyleProperty.COLOR,
                ConfigurableStyleProperty.PADDING_LEFT,
                ConfigurableStyleProperty.PADDING_RIGHT,
                ConfigurableStyleProperty.LINE_HEIGHT,
                ConfigurableStyleProperty.BACKGROUND_COLOR,
            ]),
        });
        this.footerUi = new FooterUi({
            root: assertExists(document.querySelector<HTMLElement>("#footer")),
            settingName: SettingName.READER_FOOTER,
            displayName: "页脚",
            dialog: this.readerUi.dialog,
            overlay: this.readerUi.overlay,
            configurableStyleProperties: new Set<ConfigurableStyleProperty>([
                ConfigurableStyleProperty.FONT_SIZE,
                ConfigurableStyleProperty.COLOR,
                ConfigurableStyleProperty.PADDING_TOP,
                ConfigurableStyleProperty.PADDING_BOTTOM,
                ConfigurableStyleProperty.PADDING_LEFT,
                ConfigurableStyleProperty.PADDING_RIGHT,
                ConfigurableStyleProperty.BACKGROUND_COLOR,
            ]),
        });
        this.tocUi = new TocUi({
            root: assertExists(document.querySelector<HTMLDivElement>("#toc")),
            settingName: SettingName.READER_TOC,
            displayName: "目录",
            configurableStyleProperties: new Set<ConfigurableStyleProperty>([
                ConfigurableStyleProperty.FONT_SIZE,
                ConfigurableStyleProperty.COLOR,
                ConfigurableStyleProperty.PADDING_TOP,
                ConfigurableStyleProperty.PADDING_BOTTOM,
                ConfigurableStyleProperty.PADDING_LEFT,
                ConfigurableStyleProperty.PADDING_RIGHT,
                ConfigurableStyleProperty.BACKGROUND_COLOR,
            ]),
        });
        this.settingUi = new SettingUi({
            canBootstrap: false,
            args: {
                settingName: SettingName.SETTING,
                displayName: "设置",
                root: assertExists(document.querySelector<HTMLDivElement>(".setting")),
            },
            uis: [this.docUi, this.readerUi, this.headerUi, this.bodyUi, this.footerUi, this.tocUi],
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
        // 也就是saveReadingProgress和saveReaderSetting被调用一次，这个无副作用的调用是可以接受的，因为只是重复保存了一下。
        // 目前还没有发现可以避免这种情况的好办法

        this.docUi.applyStyle(this.state.settings.get(SettingName.READER_DOC)?.style ?? {});

        this.readerUi.applyStyle(this.state.settings.get(SettingName.READER)?.style ?? {});

        this.tocUi
            .renderContents(this.state.toc.contents)
            .applyStyle(this.state.settings.get(SettingName.READER_TOC)?.style ?? {});

        this.bodyUi
            .renderChapter(this.state.chapter.lines)
            .applyStyle(this.state.settings.get(SettingName.READER_CONTENT)?.style ?? {})
            .restoreReadingProgress(this.state.readingProgress.lineIndex, this.state.readingProgress.lineVisibleRatio);

        this.footerUi
            .renderChapterTitle(this.state.chapter.title)
            .renderReadingProgress(
                this.state.chapter.startLineNumber + this.state.readingProgress.lineIndex,
                this.state.toc.numberOfLines()
            )
            .applyStyle(this.state.settings.get(SettingName.READER_FOOTER)?.style ?? {});

        this.headerUi.applyStyle(this.state.settings.get(SettingName.READER_HEADER)?.style ?? {});

        this.settingUi.renderAside().applyStyle(this.state.settings.get(SettingName.SETTING)?.style ?? {});

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
            this.state.readingProgress.chapterIndex
        );

        // 渲染正文
        this.bodyUi
            .renderChapter(this.state.chapter.lines)
            .restoreReadingProgress(this.state.readingProgress.lineIndex, this.state.readingProgress.lineVisibleRatio);

        // 渲染底部信息
        this.footerUi
            .renderChapterTitle(this.state.chapter.title)
            .renderReadingProgress(
                this.state.chapter.startLineNumber + this.state.readingProgress.lineIndex,
                this.state.toc.numberOfLines()
            );

        // 高亮当前章节
        this.tocUi.highlightCurrentChapter(this.state.readingProgress.chapterIndex);
    }

    /**
     * 更新阅读进度
     * @param readingProgress - 阅读进度对象
     */
    private async updateReadingProgress(readingProgress: Partial<ReadingProgress>) {
        this.state.readingProgress.update(readingProgress);
        await this.readerService.updateReadingProgress(this.state.readingProgress);
    }

    /**
     * 更新设置并保存
     */
    private async updateSetting(settingName: SettingName, style: Partial<Record<ConfigurableStyleProperty, string>>) {
        const setting =
            this.state.settings.get(settingName) ??
            new ReaderSetting({ id: crypto.randomUUID(), name: settingName, style: {} });
        // style合并覆盖setting.style
        setting.style = { ...setting.style, ...style };
        this.state.settings.set(settingName, setting);
        await this.readerService.updateSetting(setting);
    }

    /**
     * 删除阅读器设置
     */
    private async deleteSettings(settingNames: SettingName[]) {
        await this.readerService.deleteSettings(settingNames);
    }

    /**
     * 切换章节
     * @param  direction - 方向
     */
    private async switchChapter(direction: SwitchChapterDirection) {
        if (direction === SwitchChapterDirection.PREV) {
            if (this.state.readingProgress.chapterIndex === 1) {
                await this.docUi.alertDialog("已经是第一章了");
            } else {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.updateReadingProgress({
                        chapterIndex: this.state.readingProgress.chapterIndex - 1,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                    });
                    await this.loadChapter();
                });
            }
        } else if (direction === SwitchChapterDirection.NEXT) {
            if (this.state.readingProgress.chapterIndex === this.state.toc.numberOfChapters()) {
                await this.docUi.alertDialog("已经是最后一章了");
            } else {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.updateReadingProgress({
                        chapterIndex: this.state.readingProgress.chapterIndex + 1,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
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
        this.docUi.bindChapterNavigation(this.bodyUi.root, (direction) => this.switchChapter(direction));

        // reader ui事件
        this.readerUi.observeReaderResize((width) =>
            this.updateSetting(SettingName.READER, { [ConfigurableStyleProperty.WIDTH]: width })
        );

        // header ui事件
        this.headerUi
            .bindToggleTocPanel(() => {
                this.tocUi.toggleToc().highlightCurrentChapter(this.state.readingProgress.chapterIndex);
            })
            .bindToggleSettingPanel(() => this.settingUi.toggleSetting())
            .bindToggleFullscreen(() => {
                this.docUi
                    .toggleFullscreen()
                    .then(() => this.bodyUi.dispatchContentScroll())
                    .catch(async () => await this.readerUi.alertDialog("当前浏览器不支持全屏功能"));
            });

        // body ui事件
        this.bodyUi.bindContentScroll(async (lineIndex, lineVisibleRatio) => {
            await this.updateReadingProgress({ lineIndex, lineVisibleRatio });
            this.footerUi.renderReadingProgress(
                this.state.chapter.startLineNumber + lineIndex,
                this.state.toc.numberOfLines()
            );
        });

        // toc ui事件
        this.tocUi
            .delegateTocItemClick(async (chapterIndex) => {
                await this.readerUi.showOverlayWhile(async () => {
                    await this.updateReadingProgress({ chapterIndex, lineIndex: 1, lineVisibleRatio: 1 });
                    await this.loadChapter();
                });
            })
            .bindTocClose();

        // setting ui事件
        this.settingUi
            .bindNodeClick()
            .bindCloseSettingPanel()
            .bindResetSetting(async () => {
                await this.deleteSettings(Array.from(this.state.settings.keys()));
            })
            .bindSettingChange(async (ui, property, value) => {
                await this.updateSetting(ui.settingName, { [property]: value });
            });
    }
}
