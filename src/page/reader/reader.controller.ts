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
import ReaderSetting from "../../domain/setting/reader-setting.model";
import ReadingProgress from "../../domain/reading-progress/reading-progress.model";
import ReaderService from "./reader.service";
import HeaderUi from "./header/header.ui";
import BodyUi from "./body/body.ui";
import FooterUi from "./footer/footer.ui";
import SettingUi from "./setting/setting.ui";
import TocUi from "./toc/toc.ui";
import FullscreenUtil from "../../core/util/fullscreen.util";
import { SwitchChapterDirectionEnum } from "../../core/constant/switch-chapter-direction.enum";
import ReaderState from "./reader.state";

/**
 * 阅读器控制器
 * @author allurx
 */
export default class ReaderController {
    private doc: DocUi;
    private reader: ReaderUi;
    private header: HeaderUi;
    private body: BodyUi;
    private footer: FooterUi;
    private setting: SettingUi;
    private toc: TocUi;
    private readerService: ReaderService;
    private state!: ReaderState;

    constructor() {
        this.doc = new DocUi();
        this.reader = new ReaderUi();
        this.header = new HeaderUi();
        this.body = new BodyUi();
        this.footer = new FooterUi();
        this.setting = new SettingUi();
        this.toc = new TocUi();
        this.readerService = new ReaderService();
    }

    /**
     * 初始化阅读器
     * @param bookId - 书籍id
     */
    async init(bookId: string) {
        this.state = await this.readerService.init(bookId);

        // 渲染界面
        // 注意这里虽然是先渲染界面然后再绑定事件，但是由于浏览器的渲染机制，
        // render函数内部修改ui导致的ContentScroll和ReaderResize事件会在未来的某一刻被触发，这个时刻无法确定，由浏览器自己决定。
        // 从而导致bindContentScroll和observeReaderResize对应的事件处理函数会在页面首次加载之后某一时刻被调用，
        // 也就是saveReadingProgress和saveReaderSetting被调用一次，这个无副作用的调用是可以接受的，因为只是重复保存了一下。
        // 目前还没有发现可以避免这种情况的好办法

        this.renderAll(this.state.readerSetting);

        this.setting.render(this.state.readerSetting);
        this.toc.render(this.state.toc.contents);
        this.body
            .renderChapter(this.state.chapter.lines)
            .restoreReadingProgress(this.state.readingProgress.lineIndex, this.state.readingProgress.lineVisibleRatio);
        this.footer
            .renderChapterTitle(this.state.chapter.title)
            .renderReadingProgress(
                this.state.chapter.startLineNumber + this.state.readingProgress.lineIndex,
                this.state.toc.numberOfLines()
            );
        this.reader.show();

        // 绑定事件
        this.bindEvent();
    }

    /**
     * 加载章节
     */
    async loadChapter() {
        // 获取章节数据
        this.state.chapter = await this.readerService.getChapter(
            this.state.book.fileId,
            this.state.readingProgress.chapterIndex
        );

        // 渲染正文
        this.body
            .renderChapter(this.state.chapter.lines)
            .restoreReadingProgress(this.state.readingProgress.lineIndex, this.state.readingProgress.lineVisibleRatio);

        // 渲染底部信息
        this.footer
            .renderChapterTitle(this.state.chapter.title)
            .renderReadingProgress(
                this.state.chapter.startLineNumber + this.state.readingProgress.lineIndex,
                this.state.toc.numberOfLines()
            );

        // 高亮当前章节
        this.toc.highlightCurrentChapter(this.state.readingProgress.chapterIndex);
    }

    /**
     * 更新阅读进度
     * @param readingProgress - 阅读进度对象
     */
    async updateReadingProgress(readingProgress: Partial<ReadingProgress>) {
        this.state.readingProgress.update(readingProgress);
        await this.readerService.updateReadingProgress(this.state.readingProgress);
    }

    /**
     * 更新阅读器设置并保存
     * @param readerSetting - 阅读器设置对象
     */
    async updateReaderSetting(readerSetting: Partial<ReaderSetting>) {
        this.state.readerSetting.update(readerSetting);
        await this.readerService.updateReaderSetting(this.state.readerSetting);
    }

    /**
     * 切换章节
     * @param  direction - 方向
     */
    async switchChapter(direction: SwitchChapterDirectionEnum) {
        if (direction === SwitchChapterDirectionEnum.PREV) {
            if (this.state.readingProgress.chapterIndex === 1) {
                await this.reader.alertDialog("已经是第一章了");
            } else {
                await this.reader.showOverlayWhile(async () => {
                    await this.updateReadingProgress({
                        chapterIndex: this.state.readingProgress.chapterIndex - 1,
                        lineIndex: 1,
                        lineVisibleRatio: 1,
                    });
                    await this.loadChapter();
                });
            }
        } else if (direction === SwitchChapterDirectionEnum.NEXT) {
            if (this.state.readingProgress.chapterIndex === this.state.toc.numberOfChapters()) {
                await this.reader.alertDialog("已经是最后一章了");
            } else {
                await this.reader.showOverlayWhile(async () => {
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

    renderAll(readerSetting: ReaderSetting) {
        this.body.renderFontSize(readerSetting.fontSize);
        this.reader.renderWidth(readerSetting.pageWidth);

        this.header.renderPadding(readerSetting.pagePadding);
        this.body.renderPadding(readerSetting.pagePadding);
        this.footer.renderPadding(readerSetting.pagePadding);

        this.body.renderLineHeight(readerSetting.lineHeight);

        this.reader.renderFontColor(readerSetting.fontColor);

        this.reader.renderBackgroundColor(readerSetting.readerBackgroundColor);

        this.doc.renderBackgroundColor(readerSetting.backgroundColor);
    }

    /**
     * 绑定ui事件
     */
    bindEvent() {
        // reader ui事件
        this.reader.observeReaderResize((pageWidth) => this.updateReaderSetting({ pageWidth }));

        // header ui事件
        this.header
            .bindToggleTocPanel(() => {
                this.toc.toggleTocPanel().highlightCurrentChapter(this.state.readingProgress.chapterIndex);
            })
            .bindToggleSettingPanel(() => this.setting.toggleSettingPanel())
            .bindToggleFullscreen(() => {
                FullscreenUtil.toggle(document.documentElement)
                    .then(() => this.body.dispatchContentScroll())
                    .catch(async () => await this.reader.alertDialog("当前浏览器不支持全屏功能"));
            });

        // body ui事件
        this.body.bindContentScroll(async (lineIndex, lineVisibleRatio) => {
            await this.updateReadingProgress({ lineIndex, lineVisibleRatio });
            this.footer.renderReadingProgress(
                this.state.chapter.startLineNumber + lineIndex,
                this.state.toc.numberOfLines()
            );
        });

        // toc ui事件
        this.toc
            .bindTocItemClick(async (chapterIndex) => {
                await this.reader.showOverlayWhile(async () => {
                    await this.updateReadingProgress({ chapterIndex, lineIndex: 1, lineVisibleRatio: 1 });
                    await this.loadChapter();
                });
            })
            .bindCloseTocPanel();

        // setting ui事件
        this.setting
            .bindCloseSettingPanel()
            .bindResetSetting(async () => {
                const newSetting = new ReaderSetting(this.state.defaultReaderSetting).update({
                    id: this.state.readerSetting.id,
                    name: this.state.readerSetting.name,
                });
                this.setting.render(newSetting);
                this.renderAll(newSetting);
                await this.updateReaderSetting(newSetting);
            })
            .bindFontSizeChange(async (fontSize) => {
                await this.updateReaderSetting({ fontSize });
                this.body.renderFontSize(fontSize);
            })
            .bindWidthChange(async (pageWidth) => {
                await this.updateReaderSetting({ pageWidth });
                this.reader.renderWidth(pageWidth);
            })
            .bindPaddingChange(async (pagePadding) => {
                await this.updateReaderSetting({ pagePadding });
                this.header.renderPadding(pagePadding);
                this.body.renderPadding(pagePadding);
                this.footer.renderPadding(pagePadding);
            })
            .bindLineHeightChange(async (lineHeight) => {
                await this.updateReaderSetting({ lineHeight });
                this.body.renderLineHeight(lineHeight);
            })
            .bindFontColorChange(async (fontColor) => {
                await this.updateReaderSetting({ fontColor });
                this.reader.renderFontColor(fontColor);
            })
            .bindReaderBackgroundColorChange(async (readerBackgroundColor) => {
                await this.updateReaderSetting({ readerBackgroundColor });
                this.reader.renderBackgroundColor(readerBackgroundColor);
            })
            .bindBackgroundColorChange(async (backgroundColor) => {
                await this.updateReaderSetting({ backgroundColor });
                this.doc.renderBackgroundColor(backgroundColor);
            });

        // doc ui事件
        this.doc.bindChapterNavigation(this.body.getElement(), (direction) => this.switchChapter(direction));
    }
}
