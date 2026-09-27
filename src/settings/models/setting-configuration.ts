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

import type { UiId } from "@/components/ui-id";
import type Setting from "../definitions/setting";
import ThemeSetting from "../definitions/theme-setting";
import type { PageName } from "@/constants/page-name";
import { SettingScope } from "./setting-scope";
import type SettingTarget from "./setting-target";
import { Theme } from "./theme";

/**
 * 单个页面的 Appearance 能力清单及其跨目标不变量。
 *
 * 同名设置必须复用同一份定义实例，页面 Theme 只由一个目标承载。
 *
 * @author allurx
 */
export default class SettingConfiguration {
    public readonly targets: readonly SettingTarget[];
    public readonly settings: readonly Setting[];
    public readonly themeSetting: ThemeSetting;
    public readonly defaultTheme = Theme.SUNNY;

    private readonly targetById = new Map<UiId, SettingTarget>();

    public constructor(
        public readonly pageName: PageName,
        targets: readonly SettingTarget[]
    ) {
        if (targets.length === 0) throw new Error("Setting configuration requires at least one target");

        const settingByKey = new Map<string, Setting>();
        let themeSetting: ThemeSetting | undefined;

        for (const target of targets) {
            // 先固定页面归属并检查 UI 唯一性，避免同名区域共享错误的设置上下文。
            target.configureForPage(pageName);
            if (this.targetById.has(target.ui.id)) {
                throw new Error(`Duplicate setting target: ${target.ui.id}`);
            }
            this.targetById.set(target.ui.id, target);

            // 目标内的键不能重复；跨目标的同名设置必须共用同一个定义实例。
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

                // 页面级设置只允许一个 Theme，其余属性归各 UI 目标所有。
                if (setting.scope === SettingScope.PAGE) {
                    if (!(setting instanceof ThemeSetting)) {
                        throw new Error(`Unsupported page-scoped setting: ${setting.key}`);
                    }
                    if (themeSetting) throw new Error("A page can declare Theme on only one target");
                    themeSetting = setting;
                }
            }
        }

        // 全部校验通过后固化清单，供控件创建和存储过滤共同使用。
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
