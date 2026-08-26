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

import StyleSettingItem from "./style-setting-item";
import { StyleProperty } from "@/component/setting/style-property";

/**
 * Font size setting item
 * @author allurx
 */
export default class FontSizeSettingItem extends StyleSettingItem {
    public constructor() {
        super(StyleProperty.FONT_SIZE);
    }

    public override unit(): string {
        return "px";
    }

    public override template(): string {
        return `
        <div class="item">
            <span class="title">字号</span>
            <input class="control" min="12" max="100" step="1" type="range" />
            <span class="display"></span>
        </div>
        `;
    }
}
