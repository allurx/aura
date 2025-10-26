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

import ReaderSetting from "../model/readerSetting.js"
import ReaderTheme from "../model/readerTheme.js"

/**
 * Aura
 * @author allurx
 */
export default class Aura {

    /**
     * 阅读器配置数据
     */
    static reader = {
        setting: new ReaderSetting({
            id: 1,
            name: "reader-setting",
            theme: "yellow",
            fontSize: window.innerWidth > 768 ? 18 : 20,
            fontColor: "#000000",
            pageWidth: window.innerWidth > 768 ? 800 : window.innerWidth,
            pagePadding: 30,
            lineHeight: 2,
            readerBackgroundColor: "#f2e8c8",
            backgroundColor: "#be966e"
        }),
        themes: [
            new ReaderTheme(1, "浅色", "light", "#000000", "#ffffff", "#ffffff"),
            new ReaderTheme(2, "昏暗", "dim", "#e3e3e3", "#111a2e", "#111a2e"),
            new ReaderTheme(3, "深色", "dark", "#e3e3e3", "#202124", "#202124"),
            new ReaderTheme(4, "黄色", "yellow", "#000000", "#f2e8c8", "#be966e"),
            new ReaderTheme(5, "蓝色", "blue", "#000000", "#d2e3fc", "#d2e3fc"),
            new ReaderTheme(6, "灰色", "grey", "#e3e3e3", "#3c3c3c", "#3c3c3c")
        ]
    }

}