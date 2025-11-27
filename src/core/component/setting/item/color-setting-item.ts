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

import Ui from "../../ui";
import StyleEngine from "../style-engine";
import SettingState from "../setting-state";
import StyleSettingItem from "./style-setting-item";
import { StyleProperty } from "../style-property";

/**
 * Color setting item
 * @author allurx
 */
export default class ColorSettingItem extends StyleSettingItem {
    public constructor(settingState: SettingState) {
        super(StyleProperty.COLOR, settingState);
    }

    public override setControlValue(ui: Ui, value: string | undefined): this {
        const controlValue = value ?? StyleEngine.getComputedStyle(ui.root).getPropertyValue(this.styleProperty);
        this.control.value = StyleEngine.rgbToHex(controlValue);
        return this;
    }

    public override setDisplayValue(ui: Ui, value: string | undefined): this {
        const controlValue = value ?? StyleEngine.getComputedStyle(ui.root).getPropertyValue(this.styleProperty);
        this.display.textContent = StyleEngine.rgbToHex(controlValue);
        return this;
    }

    public override unit(): string {
        return "";
    }

    public override template(): string {
        return `
        <div class="item">
            <span class="title">文本颜色</span>
            <input class="control" type="color" />
            <span class="display"></span>
        </div>
        `;
    }
}
