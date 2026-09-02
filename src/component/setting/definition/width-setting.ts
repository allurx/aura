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

import { StyleProperty } from "@/component/setting/model/style-property";
import SettingTarget from "@/component/setting/model/setting-target";
import RangeStyleSetting from "./range-style-setting";

/**
 * Reader 的用户首选宽度。
 *
 * 响应式 effective width 由 CSS 决定；这里只读取和保存 inline preferred width。
 *
 * @author allurx
 */
export default class WidthSetting extends RangeStyleSetting {
    public static readonly MINIMUM = 800;
    public static readonly MAXIMUM = 10_000;

    public constructor(displayOrder: number) {
        super(StyleProperty.WIDTH, "宽度", WidthSetting.MINIMUM, WidthSetting.MAXIMUM, 1, "px", displayOrder, true);
    }

    public override resolveValue(target: SettingTarget, value: string | undefined): string {
        return value ?? (target.ui.root.style.width || `${String(WidthSetting.MINIMUM)}px`);
    }

    public override controlMaximum(target: SettingTarget, value: string): number {
        void target;
        const preferredWidth = Number.parseFloat(value);
        return Math.min(
            WidthSetting.MAXIMUM,
            Math.max(WidthSetting.MINIMUM, window.innerWidth, Number.isFinite(preferredWidth) ? preferredWidth : 0)
        );
    }

    public override readExternal(target: SettingTarget): string | undefined {
        return target.ui.root.style.width || undefined;
    }
}
