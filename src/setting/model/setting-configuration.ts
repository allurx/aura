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

import type { UiId } from "@/component/ui-id";
import type Setting from "../definition/setting";
import ThemeSetting from "../definition/theme-setting";
import type { PageName } from "@/constant/page-name";
import { SettingScope } from "./setting-scope";
import type SettingTarget from "./setting-target";
import { Theme } from "./theme";

/**
 * 单个页面的 Appearance 能力清单及其跨目标不变量。
 *
 * @author allurx
 */
export default class SettingConfiguration {
    public readonly targets: readonly SettingTarget[];
    public readonly settings: readonly Setting[];
    public readonly themeSetting: ThemeSetting;
    public readonly defaultTheme = Theme.YELLOW;

    private readonly targetById = new Map<UiId, SettingTarget>();

    public constructor(
        public readonly pageName: PageName,
        targets: readonly SettingTarget[]
    ) {
        if (targets.length === 0) throw new Error("Setting configuration requires at least one target");

        const settingByKey = new Map<string, Setting>();
        let themeSetting: ThemeSetting | undefined;

        for (const target of targets) {
            if (this.targetById.has(target.ui.id)) {
                throw new Error(`Duplicate setting target: ${target.ui.id}`);
            }
            this.targetById.set(target.ui.id, target);

            const targetKeys = new Set<string>();
            for (const setting of target.settings) {
                if (targetKeys.has(setting.key)) {
                    throw new Error(`Duplicate setting ${setting.key} on target ${target.ui.id}`);
                }
                targetKeys.add(setting.key);

                const existingSetting = settingByKey.get(setting.key);
                if (existingSetting && existingSetting !== setting) {
                    throw new Error(`Setting ${setting.key} must reuse the same definition instance`);
                }
                settingByKey.set(setting.key, setting);

                if (setting.scope === SettingScope.PAGE) {
                    if (!(setting instanceof ThemeSetting)) {
                        throw new Error(`Unsupported page-scoped setting: ${setting.key}`);
                    }
                    if (themeSetting) throw new Error("A page can declare Theme on only one target");
                    themeSetting = setting;
                }
            }
        }

        if (!themeSetting) throw new Error("Setting configuration must declare a Theme setting");
        this.targets = Object.freeze([...targets]);
        this.settings = Object.freeze([...settingByKey.values()]);
        this.themeSetting = themeSetting;
    }

    /**
     * @param uiId - UI 标识
     * @returns 对应设置目标；不存在时返回 `undefined`
     */
    public findTarget(uiId: string): SettingTarget | undefined {
        return this.targetById.get(uiId as UiId);
    }
}
