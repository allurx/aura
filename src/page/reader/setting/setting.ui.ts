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

import { assertExists } from "../../../core/util/assert.util";
import EventUtil from "../../../core/util/event.util";
import ReaderSetting from "../../../domain/setting/reader-setting.model";

/**
 * 阅读器设置面板
 * @author allurx
 */
export default class SettingUi {
    private readonly settingPanelElement: HTMLElement;
    private readonly closeSettingPanelElement: HTMLElement;
    private readonly resetSettingPanelElement: HTMLElement;
    private readonly fontSizeElement: HTMLInputElement;
    private readonly fontSizeValueElement: HTMLElement;
    private readonly widthElement: HTMLInputElement;
    private readonly widthValueElement: HTMLElement;
    private readonly paddingElement: HTMLInputElement;
    private readonly paddingValueElement: HTMLElement;
    private readonly lineHeightElement: HTMLInputElement;
    private readonly lineHeightValueElement: HTMLElement;
    private readonly fontColorElement: HTMLInputElement;
    private readonly fontColorValueElement: HTMLElement;
    private readonly readerBackgroundColorElement: HTMLInputElement;
    private readonly readerBackgroundColorValueElement: HTMLElement;
    private readonly backgroundColorElement: HTMLInputElement;
    private readonly backgroundColorValueElement: HTMLElement;

    public constructor() {
        // 面板元素
        this.settingPanelElement = assertExists(document.querySelector<HTMLElement>("#setting-panel"));

        // 控制按钮
        this.closeSettingPanelElement = assertExists(document.querySelector<HTMLElement>("#close-setting-panel"));
        this.resetSettingPanelElement = assertExists(document.querySelector<HTMLElement>("#reset-setting-panel"));

        // 设置选项
        this.fontSizeElement = assertExists(document.querySelector<HTMLInputElement>("#font-size"));
        this.fontSizeValueElement = assertExists(document.querySelector<HTMLElement>("#font-size-value"));
        this.widthElement = assertExists(document.querySelector<HTMLInputElement>("#width"));
        this.widthValueElement = assertExists(document.querySelector<HTMLElement>("#width-value"));
        this.paddingElement = assertExists(document.querySelector<HTMLInputElement>("#padding"));
        this.paddingValueElement = assertExists(document.querySelector<HTMLElement>("#padding-value"));
        this.lineHeightElement = assertExists(document.querySelector<HTMLInputElement>("#line-height"));
        this.lineHeightValueElement = assertExists(document.querySelector<HTMLElement>("#line-height-value"));
        this.fontColorElement = assertExists(document.querySelector<HTMLInputElement>("#font-color"));
        this.fontColorValueElement = assertExists(document.querySelector<HTMLElement>("#font-color-value"));
        this.readerBackgroundColorElement = assertExists(
            document.querySelector<HTMLInputElement>("#reader-background-color")
        );
        this.readerBackgroundColorValueElement = assertExists(
            document.querySelector<HTMLElement>("#reader-background-color-value")
        );
        this.backgroundColorElement = assertExists(document.querySelector<HTMLInputElement>("#background-color"));
        this.backgroundColorValueElement = assertExists(document.querySelector<HTMLElement>("#background-color-value"));
    }

    /**
     * 切换设置面板显示状态
     * @return 当前实例
     */
    public toggleSettingPanel() {
        this.settingPanelElement.hidden = !this.settingPanelElement.hidden;
        return this;
    }

    /**
     * 渲染设置面板
     * @param  readerSetting - 阅读器设置
     * @return 当前实例
     */
    public render(readerSetting: ReaderSetting) {
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
     * 绑定设置面板关闭事件
     * @return 当前实例
     */
    public bindCloseSettingPanel() {
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
    public bindResetSetting(handler: () => Promise<void>) {
        EventUtil.bind(this.resetSettingPanelElement, "click", handler);
        return this;
    }

    /**
     * 绑定字体大小变更事件
     * @param  handler - 事件处理函数
     * @return  当前实例
     */
    public bindFontSizeChange(handler: (fontSize: number) => Promise<void>) {
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
    public bindWidthChange(handler: (width: number) => Promise<void>) {
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
    public bindPaddingChange(handler: (padding: number) => Promise<void>) {
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
    public bindLineHeightChange(handler: (lineHeight: number) => Promise<void>) {
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
    public bindFontColorChange(handler: (fontColor: string) => Promise<void>) {
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
    public bindReaderBackgroundColorChange(handler: (backgroundColor: string) => Promise<void>) {
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
    public bindBackgroundColorChange(handler: (backgroundColor: string) => Promise<void>) {
        EventUtil.bind(this.backgroundColorElement, "input", async (_, target) => {
            const backgroundColor = target.value;
            this.renderBackgroundColor(backgroundColor);
            await handler(backgroundColor);
        });
        return this;
    }

    /**
     * 渲染字体大小
     * @param fontSize - 字体大小
     * @return 当前实例
     */
    private renderFontSize(fontSize: number) {
        const fontSizeStr = String(fontSize);
        this.fontSizeElement.value = fontSizeStr;
        this.fontSizeValueElement.textContent = fontSizeStr + "px";
        return this;
    }

    /**
     * 渲染页面宽度
     * @param  pageWidth - 页面宽度
     * @return 当前实例
     */
    private renderPageWidth(pageWidth: number) {
        const pageWidthStr = String(pageWidth);
        this.widthElement.min = String(window.innerWidth > 768 ? 768 : 320);
        this.widthElement.max = String(window.innerWidth);
        this.widthElement.value = pageWidthStr;
        this.widthValueElement.textContent = pageWidthStr + "px";
        return this;
    }

    /**
     * 渲染页面内边距
     * @param pagePadding - 页面内边距
     * @return 当前实例
     */
    private renderPagePadding(pagePadding: number) {
        const pagePaddingStr = String(pagePadding);
        this.paddingValueElement.textContent = pagePaddingStr + "px";
        return this;
    }

    /**
     * 渲染行高
     * @param lineHeight - 行高
     * @return 当前实例
     */
    private renderLineHeight(lineHeight: number) {
        this.lineHeightElement.value = String(lineHeight);
        this.lineHeightValueElement.textContent = String(lineHeight);
        return this;
    }

    /**
     * 渲染字体颜色
     * @param  fontColor - 字体颜色
     * @return 当前实例
     */
    private renderFontColor(fontColor: string) {
        this.fontColorElement.value = fontColor;
        this.fontColorValueElement.textContent = fontColor;
        return this;
    }

    /**
     * 渲染阅读器背景颜色
     * @param  readerBackgroundColor - 阅读器背景颜色
     * @return 当前实例
     */
    private renderReaderBackgroundColor(readerBackgroundColor: string) {
        this.readerBackgroundColorElement.value = readerBackgroundColor;
        this.readerBackgroundColorValueElement.textContent = readerBackgroundColor;
        return this;
    }

    /**
     * 渲染页面背景颜色
     * @param backgroundColor - 页面背景颜色
     * @return 当前实例
     */
    private renderBackgroundColor(backgroundColor: string) {
        this.backgroundColorElement.value = backgroundColor;
        this.backgroundColorValueElement.textContent = backgroundColor;
        return this;
    }
}
