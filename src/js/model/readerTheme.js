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
 * 阅读器主题
 * @author allurx
 */
export default class ReaderTheme {

    /** @type {number} */
    id;

    /** @type {string} */
    name;

    /** @type {string} */
    value;

    /** @type {string} */
    fontColor;

    /** @type {string} */
    contentBackgroundColor;

    /** @type {string} */
    backgroundColor;

    /**
     * @param {number} id - 主题id
     * @param {string} name - 主题名称
     * @param {string} value - 主题值
     * @param {string} fontColor - 字体颜色
     * @param {string} contentBackgroundColor - 内容背景色
     * @param {string} backgroundColor - 背景色
     */
    constructor(id, name, value, fontColor, contentBackgroundColor, backgroundColor) {
        this.id = id;
        this.name = name;
        this.value = value;
        this.fontColor = fontColor;
        this.contentBackgroundColor = contentBackgroundColor;
        this.backgroundColor = backgroundColor;
    }

}
