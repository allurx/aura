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
 * 阅读器设置
 * @author allurx
 */
export default class ReaderSetting {

    /** @type {number} */
    id;

    /** @type {string} */
    name;

    /** @type {string} */
    theme;

    /** @type {number} */
    fontSize;

    /** @type {number} */
    pageWidth;

    /** @type {number} */
    pagePadding;

    /** @type {number} */
    lineHeight;

    /** @type {string} */
    fontColor;

    /** @type {string} */
    contentBackgroundColor;

    /** @type {string} */
    backgroundColor;

    /**
     * @param {Object} data - 设置数据
     * @property {number} id - 设置id
     * @property {string} name - 设置名称
     * @property {string} theme - 主题
     * @property {number} fontSize - 字体大小
     * @property {string} fontColor - 字体颜色
     * @property {number} pageWidth - 页面宽度
     * @property {number} pagePadding - 页面内边距
     * @property {number} lineHeight - 行高
     * @property {string} contentBackgroundColor - 内容背景色
     * @property {string} backgroundColor - 背景色
     */
    constructor({
        id,
        name,
        theme,
        fontSize,
        fontColor,
        pageWidth,
        pagePadding,
        lineHeight,
        contentBackgroundColor,
        backgroundColor
    }) {
        this.id = id;
        this.name = name;
        this.theme = theme;
        this.fontSize = fontSize;
        this.fontColor = fontColor;
        this.pageWidth = pageWidth;
        this.pagePadding = pagePadding;
        this.lineHeight = lineHeight;
        this.contentBackgroundColor = contentBackgroundColor;
        this.backgroundColor = backgroundColor;
    }

}
