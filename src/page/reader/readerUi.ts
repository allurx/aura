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

/**
 * 阅读器界面
 * @author allurx
 */
import Aura from "../../core/aura.js";
import Overlay from "../../component/overlay/overlay.js";
import Dialog from "../../component/dialog/dialog.js";
import EventUtil from "../../util/eventUtil.js";
import GestureUtil from "../../util/gestureUtil.js";
import FullscreenUtil from "../../util/fullscreenUtil.js";
import ReaderTheme from "../../model/readerTheme.js";
import ReaderSetting from "../../model/readerSetting.js";
import ReadingProgress from "../../model/readingProgress.js";
import TableOfContents from "../../model/tableOfContents.js";
import Chapter from "../../model/chapter.js";
import AssertUtil from "../../util/assertUtil.js";

/**
 * 阅读器界面
 * @author allurx
 */
export default class ReaderUi {
    readerElement: HTMLElement;
    headerElement: HTMLElement;
    footerElement: HTMLElement;
    contentElement: HTMLElement;
    chapterTitleElement: HTMLElement;
    progressRateElement: HTMLElement;
    tocElement: HTMLElement;
    tocPanelElement: HTMLElement;
    settingPanelElement: HTMLElement;
    toggleTocPanelElement: HTMLElement;
    closeTocPanelElement: HTMLElement;
    toggleFullscreenElement: HTMLImageElement;
    toggleSettingPanelElement: HTMLImageElement;
    closeSettingPanelElement: HTMLElement;
    resetSettingPanelElement: HTMLElement;
    themeElement: HTMLSelectElement;
    themeValueElement: HTMLElement;
    fontSizeElement: HTMLInputElement;
    fontSizeValueElement: HTMLElement;
    widthElement: HTMLInputElement;
    widthValueElement: HTMLElement;
    paddingElement: HTMLInputElement;
    paddingValueElement: HTMLElement;
    lineHeightElement: HTMLInputElement;
    lineHeightValueElement: HTMLElement;
    fontColorElement: HTMLInputElement;
    fontColorValueElement: HTMLElement;
    readerBackgroundColorElement: HTMLInputElement;
    readerBackgroundColorValueElement: HTMLElement;
    backgroundColorElement: HTMLInputElement;
    backgroundColorValueElement: HTMLElement;

    overlay: Overlay;
    dialog: Dialog;

    constructor() {
        // 页面元素
        this.readerElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#reader"));
        this.contentElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#content"));
        this.headerElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#header"));
        this.footerElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#footer"));
        this.chapterTitleElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#chapter-title"));
        this.progressRateElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#progress-rate"));
        this.tocElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#toc"));
        this.tocPanelElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#toc-panel"));
        this.settingPanelElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#setting-panel"));

        // 控制按钮
        this.toggleTocPanelElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#toggle-toc-panel"));
        this.closeTocPanelElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#close-toc-panel"));
        this.toggleFullscreenElement = AssertUtil.assertExists(
            document.querySelector<HTMLImageElement>("#toggle-fullscreen")
        );
        this.toggleSettingPanelElement = AssertUtil.assertExists(
            document.querySelector<HTMLImageElement>("#toggle-setting-panel")
        );
        this.closeSettingPanelElement = AssertUtil.assertExists(
            document.querySelector<HTMLElement>("#close-setting-panel")
        );
        this.resetSettingPanelElement = AssertUtil.assertExists(
            document.querySelector<HTMLElement>("#reset-setting-panel")
        );

        // 设置选项
        this.themeElement = AssertUtil.assertExists(document.querySelector<HTMLSelectElement>("#theme"));
        this.themeValueElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#theme-value"));
        this.fontSizeElement = AssertUtil.assertExists(document.querySelector<HTMLInputElement>("#font-size"));
        this.fontSizeValueElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#font-size-value"));
        this.widthElement = AssertUtil.assertExists(document.querySelector<HTMLInputElement>("#width"));
        this.widthValueElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#width-value"));
        this.paddingElement = AssertUtil.assertExists(document.querySelector<HTMLInputElement>("#padding"));
        this.paddingValueElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#padding-value"));
        this.lineHeightElement = AssertUtil.assertExists(document.querySelector<HTMLInputElement>("#line-height"));
        this.lineHeightValueElement = AssertUtil.assertExists(
            document.querySelector<HTMLElement>("#line-height-value")
        );
        this.fontColorElement = AssertUtil.assertExists(document.querySelector<HTMLInputElement>("#font-color"));
        this.fontColorValueElement = AssertUtil.assertExists(document.querySelector<HTMLElement>("#font-color-value"));
        this.readerBackgroundColorElement = AssertUtil.assertExists(
            document.querySelector<HTMLInputElement>("#reader-background-color")
        );
        this.readerBackgroundColorValueElement = AssertUtil.assertExists(
            document.querySelector<HTMLElement>("#reader-background-color-value")
        );
        this.backgroundColorElement = AssertUtil.assertExists(
            document.querySelector<HTMLInputElement>("#background-color")
        );
        this.backgroundColorValueElement = AssertUtil.assertExists(
            document.querySelector<HTMLElement>("#background-color-value")
        );

        this.overlay = new Overlay({
            containerElement: this.readerElement,
            overlayStyle: { position: "absolute" },
        });

        this.dialog = new Dialog();
    }

    /**
     * 显示阅读器
     */
    showReader() {
        this.readerElement.classList.add("visible");
    }

    /**
     * 在执行处理函数时显示遮罩
     * @param handler - 处理函数
     */
    async showOverlayWhile(handler: () => Promise<void>) {
        await this.overlay.showWhile(handler);
    }

    /**
     * 一次性渲染全部内容
     * @param readerSetting - 阅读器设置
     * @param toc - 目录
     * @param chapter - 章节
     * @param readingProgress - 阅读进度
     */
    render(readerSetting: ReaderSetting, toc: TableOfContents, chapter: Chapter, readingProgress: ReadingProgress) {
        this.renderSettingPanel(readerSetting)
            .renderToc(toc.contents)
            .renderChapter(chapter.lines)
            .renderChapterTitle(chapter.title)
            .renderReadingProgress(chapter.startLineNumber + readingProgress.lineIndex, toc.numberOfLines())
            .restoreReadingProgress(readingProgress.lineIndex, readingProgress.lineVisibleRatio)
            .showReader();
    }

    /**
     * 渲染章节
     * @param  lines - 章节内容行数组
     * @return  当前实例
     */
    renderChapter(lines: string[]) {
        this.contentElement.innerHTML = "";
        const fragment = document.createDocumentFragment();
        lines.forEach((line, index) => {
            const p = document.createElement("p");
            p.dataset["index"] = (index + 1).toString();
            p.textContent = line;
            fragment.appendChild(p);
        });
        this.contentElement.appendChild(fragment);
        return this;
    }

    /**
     * 渲染章节标题
     * @param title - 标题
     * @return  当前实例
     */
    renderChapterTitle(title: string) {
        this.chapterTitleElement.textContent = title;
        return this;
    }

    /**
     * 恢复阅读进度,滚动到对应段落
     * @param lineIndex - 行索引
     * @param lineVisibleRatio - 行可见比例
     * @return  当前实例
     */
    restoreReadingProgress(lineIndex: number, lineVisibleRatio: number) {
        const p: HTMLParagraphElement = AssertUtil.assertExists(
            this.contentElement.querySelector<HTMLParagraphElement>(`p[data-index="${String(lineIndex)}"]`)
        );

        // 先定位到大概位置
        p.scrollIntoView({ block: "start", behavior: "auto" });

        // 然后微调到精确位置
        const offset = p.offsetHeight * (1 - lineVisibleRatio);
        this.contentElement.scrollTop += offset;
        return this;
    }

    /**
     * 渲染进度
     * @param currentLineNumber - 当前行号
     * @param numberOfLines - 总行数
     * @return 当前实例
     */
    renderReadingProgress(currentLineNumber: number, numberOfLines: number) {
        const rate = ((currentLineNumber / numberOfLines) * 100).toFixed(2);
        this.progressRateElement.textContent = `${rate}%`;
        return this;
    }

    /**
     * 高亮目录中的当前章节
     * @param chapterIndex 章节索引
     * @return 当前实例
     */
    highlightCurrentChapter(chapterIndex: number) {
        if (!this.tocPanelElement.hidden) {
            // 移除之前的章节高亮
            this.tocElement.querySelector("p.active")?.classList.remove("active");

            // 高亮当前章节
            const currentTocElement = this.tocElement.querySelector(`p[data-index="${String(chapterIndex)}"]`);
            currentTocElement?.classList.add("active");

            // 滚动到当前章节
            currentTocElement?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return this;
    }

    /**
     * 渲染目录
     * @param  contents - 目录内容数组
     * @return 当前实例
     */
    renderToc(contents: InstanceType<typeof TableOfContents.Content>[]) {
        // 创建文档片段,避免多次dom操作
        const fragment = document.createDocumentFragment();

        contents.forEach((content) => {
            const p = document.createElement("p");
            p.textContent = content.title;
            p.dataset["index"] = content.index.toString();
            fragment.appendChild(p);
        });

        // 一次性添加到容器
        this.tocElement.appendChild(fragment);
        return this;
    }

    /**
     * 渲染设置面板
     * @param  readerSetting - 阅读器设置
     * @return 当前实例
     */
    renderSettingPanel(readerSetting: ReaderSetting) {
        this.renderTheme(
            AssertUtil.assertExists(Aura.reader.themes.find((theme) => theme.value === readerSetting.theme))
        );
        this.renderFontSize(readerSetting.fontSize);
        this.renderPageWidth(readerSetting.pageWidth);
        this.renderPagePadding(readerSetting.pagePadding);
        this.renderLineHeight(readerSetting.lineHeight);
        this.renderFontColor(readerSetting.fontColor);
        this.renderReaderBackgroundColor(readerSetting.readerBackgroundColor);
        this.renderBackgroundColor(readerSetting.backgroundColor);
        return this;
    }

    /**
     * 触发内容滚动事件
     */
    dispatchContentScroll() {
        this.contentElement.dispatchEvent(new Event("scroll"));
    }

    /**
     * 绑定目录项点击事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    bindTocItemClick(handler: (chapterIndex: number) => Promise<void>) {
        EventUtil.delegate(this.tocElement, "p", "click", async (_, target) => {
            await handler(Number(target.dataset["index"]));
        });
        return this;
    }

    /**
     * 绑定目录面板切换事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    bindToggleTocPanel(handler: () => void) {
        EventUtil.bind(this.toggleTocPanelElement, "click", () => {
            this.tocPanelElement.hidden = !this.tocPanelElement.hidden;
            handler();
        });
        return this;
    }

    /**
     * 绑定目录面板关闭事件
     * @return 当前实例
     */
    bindCloseTocPanel() {
        EventUtil.bind(this.closeTocPanelElement, "click", () => {
            this.tocPanelElement.hidden = true;
        });
        return this;
    }

    /**
     * 绑定全屏切换事件
     * @return 当前实例
     */
    bindToggleFullscreen() {
        EventUtil.bind(this.toggleFullscreenElement, "click", async () => {
            await FullscreenUtil.toggle(document.documentElement)
                .then(() => {
                    this.dispatchContentScroll();
                })
                .catch(async () => await this.dialog.alert("当前浏览器不支持全屏功能"));
        });
        return this;
    }

    /**
     * 绑定设置面板切换事件
     * @return 当前实例
     */
    bindToggleSettingPanel() {
        EventUtil.bind(this.toggleSettingPanelElement, "click", () => {
            this.settingPanelElement.hidden = !this.settingPanelElement.hidden;
        });
        return this;
    }

    /**
     * 绑定设置面板关闭事件
     * @return 当前实例
     */
    bindCloseSettingPanel() {
        EventUtil.bind(this.closeSettingPanelElement, "click", () => {
            this.settingPanelElement.hidden = true;
        });
        return this;
    }

    /**
     * 绑定重置设置事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    bindResetSetting(handler: (newSetting: ReaderSetting) => Promise<void>) {
        EventUtil.bind(this.resetSettingPanelElement, "click", async () => {
            const newSetting = Aura.reader.setting;
            this.renderSettingPanel(newSetting);
            await handler(newSetting);
        });
        return this;
    }

    /**
     * 绑定主题切换事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    bindThemeChange(handler: (theme: ReaderTheme) => Promise<void>) {
        EventUtil.bind(this.themeElement, "change", async (_, target) => {
            const theme = AssertUtil.assertExists(Aura.reader.themes.find((item) => item.value === target.value));
            this.renderTheme(theme)
                .renderFontColor(theme.fontColor)
                .renderBackgroundColor(theme.backgroundColor)
                .renderReaderBackgroundColor(theme.readerBackgroundColor);
            await handler(theme);
        });
        return this;
    }

    /**
     * 绑定字体大小变更事件
     * @param  handler - 事件处理函数
     * @return  当前实例
     */
    bindFontSizeChange(handler: (fontSize: number) => Promise<void>) {
        EventUtil.bind(this.fontSizeElement, "input", async (_, target) => {
            const fontSize = target.value;
            this.renderFontSize(Number(fontSize));
            await handler(Number(fontSize));
        });
        return this;
    }

    /**
     * 绑定页面宽度变更事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    bindWidthChange(handler: (width: number) => Promise<void>) {
        EventUtil.bind(this.widthElement, "input", async (_, target) => {
            // 计算应用的新宽度,取屏幕可见宽度和新宽度的较小值
            const pageWidth = Math.min(Math.round(Number(target.value)), window.innerWidth);
            this.renderPageWidth(pageWidth);
            await handler(pageWidth);
        });
        return this;
    }

    /**
     * 绑定内边距变更事件
     * @param  handler - 事件处理函数
     * @return  当前实例
     */
    bindPaddingChange(handler: (padding: number) => Promise<void>) {
        EventUtil.bind(this.paddingElement, "input", async (_, target) => {
            const pagePadding = Number(target.value);
            this.renderPagePadding(pagePadding);
            await handler(pagePadding);
        });
        return this;
    }

    /**
     * 绑定行高变更事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    bindLineHeightChange(handler: (lineHeight: number) => Promise<void>) {
        EventUtil.bind(this.lineHeightElement, "input", async (_, target) => {
            const lineHeight = Number(target.value);
            this.renderLineHeight(lineHeight);
            await handler(lineHeight);
        });
        return this;
    }

    /**
     * 绑定字体颜色变更事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    bindFontColorChange(handler: (fontColor: string) => Promise<void>) {
        EventUtil.bind(this.fontColorElement, "input", async (_, target) => {
            const fontColor = target.value;
            this.renderFontColor(fontColor);
            await handler(fontColor);
        });
        return this;
    }

    /**
     * 绑定阅读器背景色变更事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    bindReaderBackgroundColorChange(handler: (backgroundColor: string) => Promise<void>) {
        EventUtil.bind(this.readerBackgroundColorElement, "input", async (_, target) => {
            const readerBackgroundColor = target.value;
            this.renderReaderBackgroundColor(readerBackgroundColor);
            await handler(readerBackgroundColor);
        });
        return this;
    }

    /**
     * 绑定页面背景色变更事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    bindBackgroundColorChange(handler: (backgroundColor: string) => Promise<void>) {
        EventUtil.bind(this.backgroundColorElement, "input", async (_, target) => {
            const backgroundColor = target.value;
            this.renderBackgroundColor(backgroundColor);
            await handler(backgroundColor);
        });
        return this;
    }

    /**
     * 绑定章节导航手势
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    bindChapterNavigation(handler: (direction: "prev" | "next") => Promise<void>) {
        GestureUtil.bindChapterNavigation(this.contentElement, handler);
        return this;
    }

    /**
     * 绑定内容滚动事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    bindContentScroll(handler: (lineIndex: number, lineVisibleRatio: number) => Promise<void>) {
        EventUtil.bind(
            this.contentElement,
            "scroll",
            (() => {
                let timer: number;
                return (_, target: HTMLElement) => {
                    if (timer) window.clearTimeout(timer);
                    timer = window.setTimeout(() => {
                        void (async () => {
                            // 滚动容器可视区域
                            const cRect = target.getBoundingClientRect();

                            // 计算当前章节最上方可见的p元素
                            const line = [...target.querySelectorAll<HTMLParagraphElement>("p")]
                                .map((p: HTMLParagraphElement) => {
                                    const rect = p.getBoundingClientRect();
                                    const visibleHeight =
                                        Math.min(rect.bottom, cRect.bottom) - Math.max(rect.top, cRect.top);
                                    const ratio = Math.max(0, visibleHeight) / rect.height;
                                    return {
                                        index: Number(p.dataset["index"]),
                                        ratio: ratio,
                                        top: rect.top,
                                        text: p.innerText,
                                    };
                                })
                                .filter((item) => item.ratio > 0)
                                .reduce((prev, current) => (current.top < prev.top ? current : prev));

                            console.log("当前章节最上方可见的行: ", line);
                            await handler(line.index, line.ratio);
                        })();
                    }, 300);
                };
            })()
        );
        return this;
    }

    /**
     * 绑定阅读器尺寸变化事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    observeReaderResize(handler: (width: number) => Promise<void>) {
        new ResizeObserver(
            (() => {
                let timer: number;
                return (entries) => {
                    if (timer) clearTimeout(timer);
                    timer = window.setTimeout(() => {
                        void (async () => {
                            // reader
                            const entry = AssertUtil.assertExists(entries[0]);
                            const width = entry.contentRect.width;
                            console.log("检测到页面宽度变化：", width);
                            await handler(width);
                        })();
                    }, 300);
                };
            })()
        ).observe(this.readerElement);
        return this;
    }

    /**
     * 渲染主题
     * @param theme - 主题
     * @return 当前实例
     */
    renderTheme(theme: ReaderTheme) {
        if (this.themeElement.options.length === 0) {
            Aura.reader.themes.forEach((theme) => {
                this.themeElement.add(new Option(theme.name, theme.value));
            });
        }
        this.themeElement.value = theme.value;
        this.themeValueElement.textContent = theme.value;
        return this;
    }

    /**
     * 渲染字体大小
     * @param fontSize - 字体大小
     * @return 当前实例
     */
    renderFontSize(fontSize: number) {
        const fontSizeStr = String(fontSize);
        this.fontSizeElement.value = fontSizeStr;
        this.fontSizeValueElement.textContent = fontSizeStr + "px";
        this.contentElement.style.fontSize = fontSizeStr + "px";
        return this;
    }

    /**
     * 渲染页面宽度
     * @param  pageWidth - 页面宽度
     * @return 当前实例
     */
    renderPageWidth(pageWidth: number) {
        const pageWidthStr = String(pageWidth);
        this.widthElement.min = String(window.innerWidth > 768 ? 768 : 320);
        this.widthElement.max = String(window.innerWidth);
        this.widthElement.value = pageWidthStr;
        this.widthValueElement.textContent = pageWidthStr + "px";
        this.readerElement.style.width = pageWidthStr + "px";
        return this;
    }

    /**
     * 渲染页面内边距
     * @param pagePadding - 页面内边距
     * @return 当前实例
     */
    renderPagePadding(pagePadding: number) {
        const pagePaddingStr = String(pagePadding);
        this.paddingValueElement.textContent = pagePaddingStr + "px";
        this.headerElement.style.padding = `0 ${pagePaddingStr}px`;
        this.contentElement.style.padding = `0 ${pagePaddingStr}px`;
        this.footerElement.style.padding = `0 ${pagePaddingStr}px`;
        return this;
    }

    /**
     * 渲染行高
     * @param lineHeight - 行高
     * @return 当前实例
     */
    renderLineHeight(lineHeight: number) {
        this.lineHeightElement.value = String(lineHeight);
        this.lineHeightValueElement.textContent = String(lineHeight);
        this.contentElement.style.lineHeight = String(lineHeight);
        return this;
    }

    /**
     * 渲染字体颜色
     * @param  fontColor - 字体颜色
     * @return 当前实例
     */
    renderFontColor(fontColor: string) {
        this.fontColorElement.value = fontColor;
        this.fontColorValueElement.textContent = fontColor;
        this.readerElement.style.color = fontColor;
        return this;
    }

    /**
     * 渲染阅读器背景颜色
     * @param  readerBackgroundColor - 阅读器背景颜色
     * @return 当前实例
     */
    renderReaderBackgroundColor(readerBackgroundColor: string) {
        this.readerBackgroundColorElement.value = readerBackgroundColor;
        this.readerBackgroundColorValueElement.textContent = readerBackgroundColor;
        this.readerElement.style.backgroundColor = readerBackgroundColor;
        return this;
    }

    /**
     * 渲染页面背景颜色
     * @param backgroundColor - 页面背景颜色
     * @return 当前实例
     */
    renderBackgroundColor(backgroundColor: string) {
        this.backgroundColorElement.value = backgroundColor;
        this.backgroundColorValueElement.textContent = backgroundColor;
        document.body.style.backgroundColor = backgroundColor;
        return this;
    }
}
