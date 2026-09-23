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

import type SettingControl from "../control/setting-control";
import type SettingControlListener from "../control/setting-control-listener";
import { StyleProperty } from "../model/style-property";
import type SettingTarget from "../model/setting-target";
import RangeStyleSetting from "./range-style-setting";

/**
 * Reader 的用户首选宽度。
 *
 * 响应式 effective width 由 CSS 决定；这里只读取和保存 inline preferred width。
 *
 * @author allurx
 */
export default class WidthSetting extends RangeStyleSetting {
    public static readonly MIN_WIDTH_PX = 800;
    public static readonly MAX_WIDTH_PX = 10_000;
    public override readonly tracksExternalChanges = true;

    public constructor(displayOrder: number) {
        super(StyleProperty.WIDTH, "宽度", WidthSetting.MIN_WIDTH_PX, WidthSetting.MAX_WIDTH_PX, 1, "px", displayOrder);
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        const control = super.createControl(listener, signal);
        control.element.classList.add("width-setting");
        return control;
    }

    public override resolveValue(target: SettingTarget, value: string | undefined): string {
        return value ?? (target.ui.root.style.width || `${String(WidthSetting.MIN_WIDTH_PX)}px`);
    }

    public override controlMaximum(target: SettingTarget, value: string): number {
        void target;
        const preferredWidthPx = Number.parseFloat(value);
        return Math.min(
            WidthSetting.MAX_WIDTH_PX,
            Math.max(
                WidthSetting.MIN_WIDTH_PX,
                window.innerWidth,
                Number.isFinite(preferredWidthPx) ? preferredWidthPx : 0
            )
        );
    }

    public override readExternalValue(target: SettingTarget): string | undefined {
        return target.ui.root.style.width || undefined;
    }
}
