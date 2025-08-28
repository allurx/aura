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

    // id
    id = "reader-setting";

    // 主题
    theme;

    // 字体大小
    fontSize;

    // 页面宽度
    pageWidth;

    // 页面内边距
    pagePadding;

    // 行高
    lineHeight;

    // 字体颜色
    fontColor;

    // 内容背景色
    contentBackgroundColor;

    // 背景色
    backgroundColor;

    constructor({
        theme,
        fontSize,
        pageWidth,
        pagePadding,
        lineHeight,
        fontColor,
        contentBackgroundColor,
        backgroundColor
    }) {
        this.theme = theme;
        this.fontSize = fontSize;
        this.pageWidth = pageWidth;
        this.pagePadding = pagePadding;
        this.lineHeight = lineHeight;
        this.fontColor = fontColor;
        this.contentBackgroundColor = contentBackgroundColor;
        this.backgroundColor = backgroundColor;
    }
}
