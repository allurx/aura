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

import SelectSettingControl from "../control/select-setting-control";
import type SettingControl from "../control/setting-control";
import type SettingControlListener from "../control/setting-control-listener";
import type PageAppearance from "../model/page-appearance";
import { SettingScope } from "../model/setting-scope";
import type SettingTarget from "../model/setting-target";
import { isTheme, Theme } from "../model/theme";
import Setting from "./setting";

/**
 * 页面 Theme 定义。
 *
 * @author allurx
 */
export default class ThemeSetting extends Setting {
    public readonly options = new Map<string, string>([
        [Theme.LIGHT, "浅色"],
        [Theme.DIM, "昏暗"],
        [Theme.DARK, "深色"],
        [Theme.YELLOW, "黄色"],
        [Theme.BLUE, "蓝色"],
        [Theme.GRAY, "灰色"],
    ]);

    public constructor(displayOrder: number) {
        super("theme", "主题", SettingScope.PAGE, displayOrder);
    }

    public override accepts(value: unknown): value is Theme {
        return isTheme(value);
    }

    public override read(appearance: PageAppearance, target: SettingTarget): string {
        void target;
        return appearance.theme;
    }

    public override update(appearance: PageAppearance, target: SettingTarget, value: string): PageAppearance {
        void target;
        if (!isTheme(value)) throw new Error(`Invalid Theme setting value: ${value}`);
        return appearance.withTheme(value);
    }

    public override apply(target: SettingTarget, value: string | undefined): void {
        void target;
        document.documentElement.dataset["theme"] = isTheme(value) ? value : Theme.YELLOW;
    }

    public override resolveValue(target: SettingTarget, value: string | undefined): string {
        void target;
        return isTheme(value) ? value : Theme.YELLOW;
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new SelectSettingControl(this, listener, signal);
    }
}
