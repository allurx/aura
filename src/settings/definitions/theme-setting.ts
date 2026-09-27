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
import { isTheme, Theme } from "../models/theme";
import Setting from "./setting";

/**
 * 页面基础主题；切换主题时保留已提交的常规设置。
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
        [Theme.PAPER, "纸页"],
        [Theme.STARRY, "星夜"],
        [Theme.DUSK, "暮色"],
        [Theme.OCEAN, "深海"],
    ]);

    public constructor(displayOrder: number) {
        super("theme", "主题", displayOrder);
    }

    public override accepts(value: unknown): value is Theme {
        return isTheme(value);
    }

    public override read(appearance: PageAppearance): string {
        return appearance.theme;
    }

    public override update(appearance: PageAppearance, value: string): PageAppearance {
        if (!isTheme(value)) throw new Error(`Invalid Theme setting value: ${value}`);
        return appearance.withTheme(value);
    }

    /**
     * 只恢复页面默认主题，保留常规设置。
     */
    public override reset(appearance: PageAppearance, defaultTheme: Theme): PageAppearance {
        return appearance.withTheme(defaultTheme);
    }

    public override apply(value: string | undefined): void {
        document.documentElement.dataset["theme"] = isTheme(value) ? value : Theme.SUNNY;
    }

    public override resolveValue(value: string | undefined): string {
        return isTheme(value) ? value : Theme.SUNNY;
    }

    public override createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl {
        return new ThemeSettingControl(this, listener, signal);
    }
}
