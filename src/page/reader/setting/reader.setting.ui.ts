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

import EventUtil from "../../../core/util/event.util";
import { assertExists } from "../../../core/util/assert.util";

/**
 * 阅读器设置界面ui类
 */
export default class ReaderSettingUi {
    private readonly element: HTMLDivElement;

    private readonly fontSizeElement: HTMLInputElement | null;
    private readonly fontSizeValueElement: HTMLSpanElement | null;

    private readonly fontColorElement: HTMLInputElement | null;
    private readonly fontColorValueElement: HTMLSpanElement | null;

    private readonly widthElement: HTMLInputElement | null;
    private readonly widthValueElement: HTMLElement | null;

    private readonly paddingElement: HTMLInputElement | null;
    private readonly paddingValueElement: HTMLSpanElement | null;

    private readonly lineHeightElement: HTMLInputElement | null;
    private readonly lineHeightValueElement: HTMLSpanElement | null;

    private readonly backgroundColorElement: HTMLInputElement | null;
    private readonly backgroundColorValueElement: HTMLSpanElement | null;

    public constructor() {
        this.element = assertExists(document.querySelector<HTMLDivElement>("#setting-target-reader"));

        this.fontSizeElement = this.element.querySelector<HTMLInputElement>(".font-size");
        this.fontSizeValueElement = this.element.querySelector<HTMLSpanElement>(".font-size-value");

        this.fontColorElement = this.element.querySelector<HTMLInputElement>(".font-color");
        this.fontColorValueElement = this.element.querySelector<HTMLSpanElement>(".font-color-value");

        this.widthElement = this.element.querySelector<HTMLInputElement>(".width");
        this.widthValueElement = this.element.querySelector<HTMLElement>(".width-value");

        this.paddingElement = this.element.querySelector<HTMLInputElement>(".padding");
        this.paddingValueElement = this.element.querySelector<HTMLSpanElement>(".padding-value");

        this.lineHeightElement = this.element.querySelector<HTMLInputElement>(".line-height");
        this.lineHeightValueElement = this.element.querySelector<HTMLSpanElement>(".line-height-value");

        this.backgroundColorElement = this.element.querySelector<HTMLInputElement>(".background-color");
        this.backgroundColorValueElement = this.element.querySelector<HTMLSpanElement>(".background-color-value");
    }

    /**
     * 绑定字体大小变更事件
     * @param  handler - 事件处理函数
     * @return  当前实例
     */
    public bindFontSizeChange(handler: (fontSize: number) => Promise<void>) {
        if (this.fontSizeElement)
            EventUtil.bind(this.fontSizeElement, "input", async (_, target) => {
                const fontSize = target.value;
                this.renderFontSize(Number(fontSize));
                await handler(Number(fontSize));
            });
        return this;
    }

    /**
     * 绑定字体颜色变更事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    public bindFontColorChange(handler: (fontColor: string) => Promise<void>) {
        if (this.fontColorElement)
            EventUtil.bind(this.fontColorElement, "input", async (_, target) => {
                const fontColor = target.value;
                this.renderFontColor(fontColor);
                await handler(fontColor);
            });
        return this;
    }

    /**
     * 绑定宽度变更事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public bindWidthChange(handler: (width: number) => Promise<void>) {
        if (this.widthElement)
            EventUtil.bind(this.widthElement, "input", async (_, target) => {
                // 计算应用的新宽度,取屏幕可见宽度和新宽度的较小值
                const width = Math.min(Math.round(Number(target.value)), window.innerWidth);
                this.renderWidth(width);
                await handler(width);
            });
        return this;
    }

    /**
     * 绑定内边距变更事件
     * @param  handler - 事件处理函数
     * @return  当前实例
     */
    public bindPaddingChange(handler: (padding: number) => Promise<void>) {
        if (this.paddingElement)
            EventUtil.bind(this.paddingElement, "input", async (_, target) => {
                const padding = Number(target.value);
                this.renderPadding(padding);
                await handler(padding);
            });
        return this;
    }

    /**
     * 绑定行高变更事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public bindLineHeightChange(handler: (lineHeight: number) => Promise<void>) {
        if (this.lineHeightElement)
            EventUtil.bind(this.lineHeightElement, "input", async (_, target) => {
                const lineHeight = Number(target.value);
                this.renderLineHeight(lineHeight);
                await handler(lineHeight);
            });
        return this;
    }

    /**
     * 绑定背景色变更事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    public bindBackgroundColorChange(handler: (backgroundColor: string) => Promise<void>) {
        if (this.backgroundColorElement)
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
    public renderFontSize(fontSize: number) {
        if (this.fontSizeElement && this.fontSizeValueElement) {
            const fontSizeString = String(fontSize);
            this.fontSizeElement.value = fontSizeString;
            this.fontSizeValueElement.textContent = fontSizeString;
        }
        return this;
    }

    /**
     * 渲染字体颜色
     * @param  fontColor - 字体颜色
     * @return 当前实例
     */
    public renderFontColor(fontColor: string) {
        if (this.fontColorElement && this.fontColorValueElement) {
            this.fontColorElement.value = fontColor;
            this.fontColorValueElement.textContent = fontColor;
        }
        return this;
    }

    /**
     * 渲染宽度
     * @param  width - 宽度
     * @return 当前实例
     */
    public renderWidth(width: number) {
        if (this.widthElement && this.widthValueElement) {
            const widthString = String(width);
            this.widthElement.min = String(window.innerWidth > 768 ? 768 : 320);
            this.widthElement.max = String(window.innerWidth);
            this.widthElement.value = widthString;
            this.widthValueElement.textContent = widthString;
        }
        return this;
    }

    /**
     * 渲染内边距
     * @param padding - 内边距
     * @return 当前实例
     */
    public renderPadding(padding: number) {
        if (this.paddingElement && this.paddingValueElement) {
            const paddingString = String(padding);
            this.paddingElement.value = paddingString;
            this.paddingValueElement.textContent = paddingString;
        }
        return this;
    }

    /**
     * 渲染行高
     * @param lineHeight - 行高
     * @return 当前实例
     */
    public renderLineHeight(lineHeight: number) {
        if (this.lineHeightElement && this.lineHeightValueElement) {
            const lineHeightString = String(lineHeight);
            this.lineHeightElement.value = lineHeightString;
            this.lineHeightValueElement.textContent = lineHeightString;
        }
        return this;
    }

    /**
     * 渲染页面背景颜色
     * @param backgroundColor - 页面背景颜色
     * @return 当前实例
     */
    public renderBackgroundColor(backgroundColor: string) {
        if (this.backgroundColorElement && this.backgroundColorValueElement) {
            this.backgroundColorElement.value = backgroundColor;
            this.backgroundColorValueElement.textContent = backgroundColor;
        }
        return this;
    }
}
