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
import ReaderSetting from "../../../model/readerSetting.js";

/**
 * 设置种子数据
 * @author allurx
 */
export default class SettingSeed {
    // 默认阅读设置
    static defaultReaderSetting = new ReaderSetting({
        id: crypto.randomUUID(),
        name: "defaultReaderSetting",
        fontSize: window.innerWidth > 768 ? 18 : 20,
        fontColor: "#000000",
        pageWidth: window.innerWidth > 768 ? 800 : window.innerWidth,
        pagePadding: 30,
        lineHeight: 2,
        readerBackgroundColor: "#f2e8c8",
        backgroundColor: "#be966e",
    });

    // 自定义阅读设置
    static readerSetting = new ReaderSetting(this.defaultReaderSetting).update({
        id: crypto.randomUUID(),
        name: "readerSetting",
    });
}
