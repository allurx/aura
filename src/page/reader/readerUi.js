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
import TableOfContents from "../../model/tableOfContents.js";
import Chapter from "../../model/chapter.js";


/** 
 * 阅读器界面
 * @author allurx
 */
export default class ReaderUi {

    /** @type {HTMLElement} */
    readerElement;

    /** @type {HTMLElement} */
    headerElement;

    /** @type {HTMLElement} */
    footerElement;

    /** @type {HTMLElement} */
    contentElement;

    /** @type {HTMLElement} */
    chapterTitleElement;

    /** @type {HTMLElement} */
    progressRateElement;

    /** @type {HTMLElement} */
    tocElement;

    /** @type {HTMLElement} */
    tocPanelElement;

    /** @type {HTMLElement} */
    settingPanelElement;

    /** @type {HTMLElement} */
    toggleTocPanelElement;

    /** @type {HTMLElement} */
    closeTocPanelElement;

    /** @type {HTMLElement} */
    toggleFullscreenElement;

    /** @type {HTMLElement} */
    toggleSettingPanelElement;

    /** @type {HTMLElement} */
    closeSettingPanelElement;

    /** @type {HTMLElement} */
    resetSettingPanelElement;

    /** @type {HTMLElement} */
    themeElement;

    /** @type {HTMLElement} */
    themeValueElement;

    /** @type {HTMLElement} */
    fontSizeElement;

    /** @type {HTMLElement} */
    fontSizeValueElement;

    /** @type {HTMLElement} */
    widthElement;

    /** @type {HTMLElement} */
    widthValueElement;

    /** @type {HTMLElement} */
    paddingElement;

    /** @type {HTMLElement} */
    paddingValueElement;

    /** @type {HTMLElement} */
    lineHeightElement;

    /** @type {HTMLElement} */
    lineHeightValueElement;

    /** @type {HTMLElement} */
    fontColorElement;

    /** @type {HTMLElement} */
    fontColorValueElement;

    /** @type {HTMLElement} */
    readerBackgroundColorElement;

    /** @type {HTMLElement} */
    readerBackgroundColorValueElement;

    /** @type {HTMLElement} */
    backgroundColorElement;

    /** @type {HTMLElement} */
    backgroundColorValueElement;

    /** @type {Overlay} */
    overlay;

    /** @type {Dialog} */
    dialog;

    constructor() {

        // 页面元素
        this.readerElement = document.getElementById("reader");
        this.contentElement = document.getElementById("content");
        this.headerElement = document.getElementById("header");
        this.footerElement = document.getElementById("footer");
        this.chapterTitleElement = document.getElementById("chapter-title");
        this.progressRateElement = document.getElementById("progress-rate");
        this.tocElement = document.getElementById("toc");
        this.tocPanelElement = document.getElementById("toc-panel");
        this.settingPanelElement = document.getElementById("setting-panel");

        // 控制按钮
        this.toggleTocPanelElement = document.getElementById("toggle-toc-panel");
        this.closeTocPanelElement = document.getElementById("close-toc-panel");
        this.toggleFullscreenElement = document.getElementById("toggle-fullscreen");
        this.toggleSettingPanelElement = document.getElementById("toggle-setting-panel");
        this.closeSettingPanelElement = document.getElementById("close-setting-panel");
        this.resetSettingPanelElement = document.getElementById("reset-setting-panel");

        // 设置选项
        this.themeElement = document.getElementById("theme");
        this.themeValueElement = document.getElementById("theme-value");
        this.fontSizeElement = document.getElementById("font-size");
        this.fontSizeValueElement = document.getElementById("font-size-value");
        this.widthElement = document.getElementById("width");
        this.widthValueElement = document.getElementById("width-value");
        this.paddingElement = document.getElementById("padding");
        this.paddingValueElement = document.getElementById("padding-value");
        this.lineHeightElement = document.getElementById("line-height");
        this.lineHeightValueElement = document.getElementById("line-height-value");
        this.fontColorElement = document.getElementById("font-color");
        this.fontColorValueElement = document.getElementById("font-color-value");
        this.readerBackgroundColorElement = document.getElementById("reader-background-color");
        this.readerBackgroundColorValueElement = document.getElementById("reader-background-color-value");
        this.backgroundColorElement = document.getElementById("background-color");
        this.backgroundColorValueElement = document.getElementById("background-color-value");

        this.overlay = new Overlay({
            containerElement: this.readerElement,
            overlayStyle: { position: "absolute" }
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
     * @param {Function} handler - 处理函数
     */
    async showOverlayWhile(handler) {
        await this.overlay.showWhile(handler);
    }

    /** 
     * 一次性渲染全部内容
     * @param {ReaderSetting} readerSetting - 阅读器设置
     * @param {TableOfContents} toc - 目录
     * @param {Chapter} chapter - 章节
     * @param {ReadingProgress} readingProgress - 阅读进度
     */
    render(readerSetting, toc, chapter, readingProgress) {
        this.renderSettingPanel(readerSetting)
            .renderToc(toc.contents)
            .renderChapter(chapter.lines)
            .renderChapterTitle(chapter.title)
            .renderReadingProgress(chapter.startLineNumber + readingProgress.lineIndex, toc.numberOfLines)
            .restoreReadingProgress(readingProgress.lineIndex, readingProgress.lineVisibleRatio)
            .showReader();
    }

    /**
     * 渲染章节
     * @param {string[]} lines - 章节内容行数组
     * @return {ReaderUi} 当前实例
     */
    renderChapter(lines) {
        this.contentElement.innerHTML = "";
        const fragment = document.createDocumentFragment();
        lines.forEach((line, index) => {
            const p = document.createElement("p");
            p.dataset.index = index + 1;
            p.textContent = line;
            fragment.appendChild(p);
        });
        this.contentElement.appendChild(fragment);
        return this;
    }

    /**
     * 渲染章节标题
     * @param {string} title - 标题
     * @return {ReaderUi} 当前实例
     */
    renderChapterTitle(title) {
        this.chapterTitleElement.textContent = title;
        return this;
    }

    /**
     * 恢复阅读进度,滚动到对应段落
     * @param {number} lineIndex - 行索引
     * @param {number} lineVisibleRatio - 行可见比例
     * @return {ReaderUi} 当前实例
     */
    restoreReadingProgress(lineIndex, lineVisibleRatio) {
        const p = this.contentElement.querySelector(`p[data-index="${lineIndex}"]`);

        // 先定位到大概位置
        p.scrollIntoView({ block: "start", behavior: "auto" });

        // 然后微调到精确位置
        const offset = p.offsetHeight * (1 - lineVisibleRatio);
        this.contentElement.scrollTop += offset;
        return this;
    }

    /**
     * 渲染进度
     * @param {number} currentLineNumber - 当前行号
     * @param {number} numberOfLines - 总行数
     * @return {ReaderUi} 当前实例
     */
    renderReadingProgress(currentLineNumber, numberOfLines) {
        const rate = ((currentLineNumber / numberOfLines) * 100).toFixed(2);
        this.progressRateElement.textContent = `${rate}%`;
        return this;
    }

    /**
     * 高亮目录中的当前章节
     * @param chapterIndex 章节索引
     * @return {ReaderUi} 当前实例
     */
    highlightCurrentChapter(chapterIndex) {
        if (!this.tocPanelElement.hidden) {

            // 移除之前的章节高亮
            this.tocElement.querySelector("p.active")?.classList.remove("active");

            // 高亮当前章节
            const currentTocElement = this.tocElement.querySelector(`p[data-index="${chapterIndex}"]`);
            currentTocElement?.classList.add("active");

            // 滚动到当前章节
            currentTocElement?.scrollIntoView({ behavior: "smooth", block: "start" });
            return this;
        }
    }

    /**
     * 渲染目录
     * @param {Array<TableOfContents.Content>} contents - 目录内容数组
     * @return {ReaderUi} 当前实例
     */
    renderToc(contents) {

        // 创建文档片段,避免多次dom操作
        const fragment = document.createDocumentFragment();

        contents.forEach(content => {
            const p = document.createElement("p");
            p.textContent = content.title;
            p.dataset.index = content.index;
            fragment.appendChild(p);
        });

        // 一次性添加到容器
        this.tocElement.appendChild(fragment);
        return this;
    }

    /**
     * 渲染设置面板
     * @param {ReaderSetting} readerSetting - 阅读器设置
     * @return {ReaderUi} 当前实例
     */
    renderSettingPanel(readerSetting) {
        this.renderTheme(Aura.reader.themes.find(theme => theme.value === readerSetting.theme));
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
     * @param {(chapterIndex: number) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindTocItemClick(handler) {
        EventUtil.delegate(this.tocElement, "p", "click", async (event, target) => {
            await handler(Number(target.dataset.index));
        });
        return this;
    }

    /**
     * 绑定目录面板切换事件
     * @param {Function} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindToggleTocPanel(handler) {
        EventUtil.bind(this.toggleTocPanelElement, "click", async (event, target) => {
            this.tocPanelElement.hidden = !this.tocPanelElement.hidden;
            await handler();
        });
        return this;
    }

    /**
     * 绑定目录面板关闭事件
     * @return {ReaderUi} 当前实例
     */
    bindCloseTocPanel() {
        EventUtil.bind(this.closeTocPanelElement, "click", (event, target) => this.tocPanelElement.hidden = true);
        return this;
    }

    /**
     * 绑定全屏切换事件
     * @return {ReaderUi} 当前实例
     */
    bindToggleFullscreen() {
        EventUtil.bind(this.toggleFullscreenElement, "click", async (event, target) =>
            await FullscreenUtil
                .toggle(document.documentElement)
                .then(() => this.dispatchContentScroll())
                .catch(error => this.dialog.alert(error.message)));
        return this;
    }

    /**
     * 绑定设置面板切换事件
     * @return {ReaderUi} 当前实例
     */
    bindToggleSettingPanel() {
        EventUtil.bind(this.toggleSettingPanelElement, "click", (event, target) => this.settingPanelElement.hidden = !this.settingPanelElement.hidden);
        return this;
    }

    /**
     * 绑定设置面板关闭事件
     * @return {ReaderUi} 当前实例
     */
    bindCloseSettingPanel() {
        EventUtil.bind(this.closeSettingPanelElement, "click", (event, target) => this.settingPanelElement.hidden = true);
        return this;
    }

    /**
     * 绑定重置设置事件
     * @param {(readerSetting: ReaderSetting) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindResetSetting(handler) {
        EventUtil.bind(this.resetSettingPanelElement, "click", async (event, target) => {
            const newSetting = new ReaderSetting(Aura.reader.setting);
            this.renderSettingPanel(newSetting);
            await handler(newSetting);
        });
        return this;
    }

    /**
     * 绑定主题切换事件
     * @param {(theme: ReaderTheme) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindThemeChange(handler) {
        EventUtil.bind(this.themeElement, "change", async (event, target) => {
            const theme = Aura.reader.themes.find(item => item.value === target.value);
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
     * @param {(fontSize: number) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindFontSizeChange(handler) {
        EventUtil.bind(this.fontSizeElement, "input", async (event, target) => {
            const fontSize = target.value;
            this.renderFontSize(fontSize);
            await handler(fontSize);
        });
        return this;
    }

    /**  
     * 绑定页面宽度变更事件
     * @param {(width: number) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindWidthChange(handler) {
        EventUtil.bind(this.widthElement, "input", async (event, target) => {
            // 计算应用的新宽度,取屏幕可见宽度和新宽度的较小值
            const pageWidth = Math.min(Math.round(target.value), window.innerWidth);
            this.renderPageWidth(pageWidth);
            await handler(pageWidth);
        });
        return this;
    }

    /**
     * 绑定内边距变更事件
     * @param {(padding: number) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindPaddingChange(handler) {
        EventUtil.bind(this.paddingElement, "input", async (event, target) => {
            const pagePadding = target.value;
            this.renderPagePadding(pagePadding);
            await handler(pagePadding);
        });
        return this;
    }

    /**
     * 绑定行高变更事件
     * @param {(lineHeight: number) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindLineHeightChange(handler) {
        EventUtil.bind(this.lineHeightElement, "input", async (event, target) => {
            const lineHeight = target.value;
            this.renderLineHeight(lineHeight);
            await handler(lineHeight);
        });
        return this;
    }

    /**
     * 绑定字体颜色变更事件
     * @param {(fontColor: string) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindFontColorChange(handler) {
        EventUtil.bind(this.fontColorElement, "input", async (event, target) => {
            const fontColor = target.value;
            this.renderFontColor(fontColor);
            await handler(fontColor);
        });
        return this;
    }

    /**
     * 绑定阅读器背景色变更事件
     * @param {(backgroundColor: string) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindReaderBackgroundColorChange(handler) {
        EventUtil.bind(this.readerBackgroundColorElement, "input", async (event, target) => {
            const readerBackgroundColor = target.value;
            this.renderReaderBackgroundColor(readerBackgroundColor);
            await handler(readerBackgroundColor);
        });
        return this;
    }

    /**
     * 绑定页面背景色变更事件
     * @param {(backgroundColor: string) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindBackgroundColorChange(handler) {
        EventUtil.bind(this.backgroundColorElement, "input", async (event, target) => {
            const backgroundColor = target.value;
            this.renderBackgroundColor(backgroundColor);
            await handler(backgroundColor);
        });
        return this;
    }

    /** 
     * 绑定章节导航手势
     * @param {(direction: "prev" | "next") => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindChapterNavigation(handler) {
        GestureUtil.bindChapterNavigation(this.contentElement, handler);
        return this;
    }

    /** 
     * 绑定内容滚动事件
     * @param {(lineIndex: number, lineVisibleRatio: number) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    bindContentScroll(handler) {
        EventUtil.bind(this.contentElement, "scroll", (() => {
            let timer;
            return (event, target) => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(async () => {

                    // 滚动容器可视区域
                    const cRect = target.getBoundingClientRect();

                    // 计算当前章节最上方可见的p元素
                    const line = [...target.querySelectorAll("p")]
                        .map(p => {
                            const rect = p.getBoundingClientRect();
                            const visibleHeight = Math.min(rect.bottom, cRect.bottom) - Math.max(rect.top, cRect.top);
                            const ratio = Math.max(0, visibleHeight) / rect.height;
                            return {
                                index: Number(p.dataset.index),
                                ratio: ratio,
                                top: rect.top,
                                text: p.innerText
                            };
                        })
                        .filter(item => item.ratio > 0)
                        .reduce((prev, current) => current.top < prev.top ? current : prev);

                    if (line) {
                        console.log("当前章节最上方可见的行: ", line);
                        await handler(Number(line.index), line.ratio);
                    }
                }, 300);
            };
        })());
        return this;
    }

    /** 
     * 绑定阅读器尺寸变化事件
     * @param {(width: number) => Promise<void>} handler - 事件处理函数
     * @return {ReaderUi} 当前实例
     */
    observeReaderResize(handler) {
        new ResizeObserver(
            (() => {
                let timer;
                return entries => {
                    if (timer) clearTimeout(timer);
                    timer = setTimeout(async () => {

                        // 当前reader的宽度
                        const width = entries[0].contentRect.width;
                        console.log("检测到页面宽度变化：", width);
                        await handler(width);

                    }, 300);
                };
            })())
            .observe(this.readerElement);
        return this;
    }

    /** 
     * 渲染主题
     * @param {ReaderTheme} theme - 主题
     * @return {ReaderUi} 当前实例
     */
    renderTheme(theme) {
        if (this.themeElement.options.length === 0) Aura.reader.themes.forEach(theme => this.themeElement.add(new Option(theme.name, theme.value)));
        this.themeElement.value = theme.value;
        this.themeValueElement.textContent = theme.value;
        return this;
    }

    /**
     * 渲染字体大小
     * @param {number} fontSize - 字体大小
     * @return {ReaderUi} 当前实例
     */
    renderFontSize(fontSize) {
        this.fontSizeElement.value = fontSize;
        this.fontSizeValueElement.textContent = fontSize + "px";
        this.contentElement.style.fontSize = fontSize + "px";
        return this;
    }

    /**
     * 渲染页面宽度
     * @param {number} pageWidth - 页面宽度
     * @return {ReaderUi} 当前实例
     */
    renderPageWidth(pageWidth) {
        this.widthElement.min = window.innerWidth > 768 ? 768 : 320;
        this.widthElement.max = window.innerWidth;
        this.widthElement.value = pageWidth;
        this.widthValueElement.textContent = pageWidth + "px";
        this.readerElement.style.width = pageWidth + "px";
        return this;
    }

    /**
     * 渲染页面内边距
     * @param {number} pagePadding - 页面内边距
     * @return {ReaderUi} 当前实例
     */
    renderPagePadding(pagePadding) {
        this.paddingElement.value = pagePadding;
        this.paddingValueElement.textContent = pagePadding + "px";
        this.headerElement.style.padding = `0 ${pagePadding}px`;
        this.contentElement.style.padding = `0 ${pagePadding}px`;
        this.footerElement.style.padding = `0 ${pagePadding}px`;
        return this;
    }

    /** 
     * 渲染行高
     * @param {number} lineHeight - 行高
     * @return {ReaderUi} 当前实例
     */
    renderLineHeight(lineHeight) {
        this.lineHeightElement.value = lineHeight;
        this.lineHeightValueElement.textContent = lineHeight;
        this.contentElement.style.lineHeight = lineHeight;
        return this;
    }

    /**
     * 渲染字体颜色
     * @param {string} fontColor - 字体颜色
     * @return {ReaderUi} 当前实例
     */
    renderFontColor(fontColor) {
        this.fontColorElement.value = fontColor;
        this.fontColorValueElement.textContent = fontColor;
        this.readerElement.style.color = fontColor;
        return this;
    }

    /**
     * 渲染阅读器背景颜色
     * @param {string} readerBackgroundColor - 阅读器背景颜色
     * @return {ReaderUi} 当前实例
     */
    renderReaderBackgroundColor(readerBackgroundColor) {
        this.readerBackgroundColorElement.value = readerBackgroundColor;
        this.readerBackgroundColorValueElement.textContent = readerBackgroundColor;
        this.readerElement.style.backgroundColor = readerBackgroundColor;
        return this;
    }

    /** 
     * 渲染页面背景颜色
     * @param {string} backgroundColor - 页面背景颜色
     * @return {ReaderUi} 当前实例
     */
    renderBackgroundColor(backgroundColor) {
        this.backgroundColorElement.value = backgroundColor;
        this.backgroundColorValueElement.textContent = backgroundColor;
        document.body.style.backgroundColor = backgroundColor;
        return this;
    }


}