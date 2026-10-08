/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Setting from "../definitions/setting";
import type ThemeSetting from "../definitions/theme-setting";
import type { PageName } from "@/constants/page-name";
import type { Theme } from "./theme";

/**
 * 常规设置按用途分组；折叠只影响呈现，不影响设置存储或重置范围。
 */
export interface SettingGroup {
    readonly id: string;
    readonly title: string;
    readonly collapsible: boolean;
    readonly settings: readonly Setting[];
}

/**
 * 页面固定提供主题，常规设置按实际操作顺序组织。
 */
export interface PageSettings {
    readonly theme: ThemeSetting;
    readonly defaultTheme: Theme;
    readonly generalGroups: readonly SettingGroup[];
}

/**
 * 当前页面的外观设置清单，供控件、状态更新与持久化共用。
 *
 */
export default class SettingConfiguration {
    public readonly theme: ThemeSetting;
    public readonly general: readonly Setting[];
    public readonly settings: readonly Setting[];
    public readonly defaultTheme: Theme;
    public readonly generalGroups: readonly SettingGroup[];

    public constructor(
        public readonly pageName: PageName,
        { theme, defaultTheme, generalGroups }: PageSettings
    ) {
        const general = generalGroups.flatMap((group) => group.settings);
        const keys = new Set<string>([theme.key]);
        for (const setting of general) {
            if (keys.has(setting.key)) throw new Error(`Duplicate setting: ${setting.key}`);
            keys.add(setting.key);
        }
        this.theme = theme;
        this.defaultTheme = defaultTheme;
        this.generalGroups = generalGroups;
        this.general = Object.freeze([...general]);
        this.settings = Object.freeze([theme, ...this.general]);
    }
}
