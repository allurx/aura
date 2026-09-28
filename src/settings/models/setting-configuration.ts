/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";
import type StyleSetting from "../definitions/style-setting";
import type ThemeSetting from "../definitions/theme-setting";
import type { PageName } from "@/constants/page-name";
import { Theme } from "./theme";

/**
 * 页面固定提供主题，常规设置按页面配置；数组顺序就是控件顺序。
 */
export interface PageSettings {
    readonly theme: ThemeSetting;
    readonly general: readonly StyleSetting[];
}

/**
 * 当前页面的外观设置清单，供控件、状态更新与持久化共用。
 *
 */
export default class SettingConfiguration {
    public readonly theme: ThemeSetting;
    public readonly general: readonly StyleSetting[];
    public readonly settings: readonly Setting[];
    public readonly defaultTheme = Theme.SUNNY;

    public constructor(
        public readonly pageName: PageName,
        { theme, general }: PageSettings
    ) {
        const keys = new Set<string>([theme.key]);
        for (const setting of general) {
            if (keys.has(setting.key)) throw new Error(`Duplicate setting: ${setting.key}`);
            keys.add(setting.key);
        }
        this.theme = theme;
        this.general = Object.freeze([...general]);
        this.settings = Object.freeze([theme, ...this.general]);
    }
}
