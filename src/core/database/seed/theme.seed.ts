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
import Theme from "../../../domain/theme/theme.model";

/**
 * 阅读主题数据种子
 * @author allurx
 */
export default class ThemeSeed {
    static themes = [
        new Theme({
            id: crypto.randomUUID(),
            name: "浅色",
            fontColor: "#000000",
            readerBackgroundColor: "#ffffff",
            backgroundColor: "#ffffff",
        }),
        new Theme({
            id: crypto.randomUUID(),
            name: "昏暗",
            fontColor: "#e3e3e3",
            readerBackgroundColor: "#111a2e",
            backgroundColor: "#111a2e",
        }),
        new Theme({
            id: crypto.randomUUID(),
            name: "深色",
            fontColor: "#e3e3e3",
            readerBackgroundColor: "#202124",
            backgroundColor: "#202124",
        }),
        new Theme({
            id: crypto.randomUUID(),
            name: "黄色",
            fontColor: "#000000",
            readerBackgroundColor: "#f2e8c8",
            backgroundColor: "#be966e",
        }),
        new Theme({
            id: crypto.randomUUID(),
            name: "蓝色",
            fontColor: "#000000",
            readerBackgroundColor: "#d2e3fc",
            backgroundColor: "#d2e3fc",
        }),
        new Theme({
            id: crypto.randomUUID(),
            name: "灰色",
            fontColor: "#e3e3e3",
            readerBackgroundColor: "#3c3c3c",
            backgroundColor: "#3c3c3c",
        }),
    ];
}
