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
            id: crypto.randomUUID(),
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
            new ReaderTheme({ id: crypto.randomUUID(), name: "浅色", value: "light", fontColor: "#000000", readerBackgroundColor: "#ffffff", backgroundColor: "#ffffff" }),
            new ReaderTheme({ id: crypto.randomUUID(), name: "昏暗", value: "dim", fontColor: "#e3e3e3", readerBackgroundColor: "#111a2e", backgroundColor: "#111a2e" }),
            new ReaderTheme({ id: crypto.randomUUID(), name: "深色", value: "dark", fontColor: "#e3e3e3", readerBackgroundColor: "#202124", backgroundColor: "#202124" }),
            new ReaderTheme({ id: crypto.randomUUID(), name: "黄色", value: "yellow", fontColor: "#000000", readerBackgroundColor: "#f2e8c8", backgroundColor: "#be966e" }),
            new ReaderTheme({ id: crypto.randomUUID(), name: "蓝色", value: "blue", fontColor: "#000000", readerBackgroundColor: "#d2e3fc", backgroundColor: "#d2e3fc" }),
            new ReaderTheme({ id: crypto.randomUUID(), name: "灰色", value: "grey", fontColor: "#e3e3e3", readerBackgroundColor: "#3c3c3c", backgroundColor: "#3c3c3c" })
        ]
    }

}