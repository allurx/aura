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

import Ui from "@/component/ui";
import StyleEngine from "@/component/setting/style-engine";
import StyleSettingItem from "./style-setting-item";
import { StyleProperty } from "@/component/setting/style-property";

/**
 * Background color setting item
 * @author allurx
 */
export default class BackgroundColorSettingItem extends StyleSettingItem {
    public constructor() {
        super(StyleProperty.BACKGROUND_COLOR);
    }

    public override setControlValue(ui: Ui, value: string | undefined): this {
        this.control.value = StyleEngine.rgbToHex(
            value ?? StyleEngine.getComputedStyle(ui.root).getPropertyValue(this.styleProperty)
        );
        return this;
    }

    public override setDisplayValue(ui: Ui, value: string | undefined): this {
        this.display.textContent = StyleEngine.rgbToHex(
            value ?? StyleEngine.getComputedStyle(ui.root).getPropertyValue(this.styleProperty)
        );
        return this;
    }

    public override unit(): string {
        return "";
    }

    public override template(): string {
        return `
        <div class="item">
            <span class="title">背景颜色</span>
            <input class="control" type="color" />
            <span class="display"></span>
        </div>
        `;
    }
}
