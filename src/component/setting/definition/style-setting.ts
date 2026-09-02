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

import PageAppearance from "@/component/setting/model/page-appearance";
import { SettingScope } from "@/component/setting/model/setting-scope";
import { StyleProperty } from "@/component/setting/model/style-property";
import SettingTarget from "@/component/setting/model/setting-target";
import Setting from "./setting";

/**
 * 投影为单个 UI inline CSS 属性的 Appearance 定义。
 *
 * @author allurx
 */
export default abstract class StyleSetting extends Setting {
    protected constructor(
        public readonly property: StyleProperty,
        title: string,
        displayOrder: number,
        synchronizesExternal = false
    ) {
        super(property, title, SettingScope.UI, displayOrder, synchronizesExternal);
    }

    public override read(appearance: PageAppearance, target: SettingTarget): string | undefined {
        return appearance.getStyle(target.ui.id, this.property);
    }

    public override update(appearance: PageAppearance, target: SettingTarget, value: string): PageAppearance {
        if (!this.accepts(value)) throw new Error(`Invalid ${this.key} setting value`);
        return appearance.withStyle(target.ui.id, this.property, value);
    }

    public override apply(target: SettingTarget, value: string | undefined): void {
        if (value === undefined) target.ui.root.style.removeProperty(this.property);
        else target.ui.root.style.setProperty(this.property, value);
    }

    public override resolveValue(target: SettingTarget, value: string | undefined): string {
        return value ?? window.getComputedStyle(target.ui.root).getPropertyValue(this.property).trim();
    }
}
