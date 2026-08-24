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

import SettingState from "@/component/setting/setting-state";
import StyleSettingItem from "./style-setting-item";
import { StyleProperty } from "@/component/setting/style-property";

/**
 * Padding bottom setting item
 * @author allurx
 */
export default class PaddingBottomSettingItem extends StyleSettingItem {
    public constructor(settingState: SettingState) {
        super(StyleProperty.PADDING_BOTTOM, settingState);
    }

    public override unit(): string {
        return "px";
    }

    public override template(): string {
        return `
            <div class="item">
                <span class="title">下内边距</span>
                <input type="range" class="control" min="0" max="100" step="1" />
                <span class="display"></span>
            </div>
        `;
    }
}
