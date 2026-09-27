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

import ThemeSettingControl from "../controls/theme-setting-control";
import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type PageAppearance from "../models/page-appearance";
import { SettingScope } from "../models/setting-scope";
import type SettingTarget from "../models/setting-target";
import { isTheme, Theme } from "../models/theme";
import Setting from "./setting";

/**
 * 页面 Theme 定义。
 *
 * 只切换文档的主题标识，不重写各 UI 已保存的显式样式。
 *
 * @author allurx
 */
export default class ThemeSetting extends Setting {
    public readonly options = new Map<string, string>([
        [Theme.SUNNY, "晴空"],
        [Theme.BREEZE, "海盐"],
        [Theme.MEADOW, "薄荷"],
        [Theme.PEACH, "杏桃"],
        [Theme.BLOSSOM, "花信"],
        [Theme.STARRY, "星夜"],
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
        document.documentElement.dataset["theme"] = isTheme(value) ? value : Theme.SUNNY;
    }

    public override resolveValue(target: SettingTarget, value: string | undefined): string {
        void target;
        return isTheme(value) ? value : Theme.SUNNY;
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new ThemeSettingControl(this, listener, signal);
    }
}
