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

import { SettingScope } from "@/component/setting/model/setting-scope";
import PageAppearance from "@/component/setting/model/page-appearance";
import SettingConfiguration from "@/component/setting/model/setting-configuration";
import { assertExists } from "@/util/assert-util";

/**
 * 单个页面 Appearance 的同步 localStorage 仓库。
 *
 * 读取只接受当前 Configuration 白名单；损坏或未知字段会被忽略，不进行兼容转换或 write-back。
 *
 * @author allurx
 */
export default class AppearanceRepository {
    private readonly storageKey: string;

    public constructor(private readonly configuration: SettingConfiguration) {
        this.storageKey = `aura.${configuration.pageName}.appearance`;
    }

    /** @returns 当前页面已保存的 Appearance；存储不可用或数据损坏时返回默认值。 */
    public load(): PageAppearance {
        const defaults = PageAppearance.defaults(this.configuration.defaultTheme);
        let serializedAppearance: string | null;
        try {
            serializedAppearance = localStorage.getItem(this.storageKey);
        } catch {
            return defaults;
        }
        if (serializedAppearance === null) return defaults;

        let parsedAppearance: unknown;
        try {
            parsedAppearance = JSON.parse(serializedAppearance);
        } catch {
            return defaults;
        }
        return this.decode(parsedAppearance);
    }

    /**
     * @param appearance - 已通过当前 Configuration 构造的快照
     * @throws {DOMException} localStorage 不可写时抛出
     */
    public save(appearance: PageAppearance): void {
        localStorage.setItem(this.storageKey, JSON.stringify(appearance));
    }

    /**
     * 删除当前页面的 Appearance 快照。
     *
     * @throws {DOMException} localStorage 不可写时抛出
     */
    public reset(): void {
        localStorage.removeItem(this.storageKey);
    }

    private decode(value: unknown): PageAppearance {
        let appearance = PageAppearance.defaults(this.configuration.defaultTheme);
        if (!this.isRecord(value)) return appearance;

        const theme = value["theme"];
        if (this.configuration.themeSetting.accepts(theme)) {
            const themeTarget = assertExists(
                this.configuration.targets.find((target) => target.supports(this.configuration.themeSetting))
            );
            appearance = this.configuration.themeSetting.update(appearance, themeTarget, theme);
        }

        const ui = value["ui"];
        if (!this.isRecord(ui)) return appearance;
        for (const [uiId, rawStyles] of Object.entries(ui)) {
            const target = this.configuration.findTarget(uiId);
            if (!target || !this.isRecord(rawStyles)) continue;

            for (const [key, rawValue] of Object.entries(rawStyles)) {
                const setting = target.findSetting(key);
                if (!setting || setting.scope !== SettingScope.UI || !setting.accepts(rawValue)) continue;
                appearance = setting.update(appearance, target, rawValue);
            }
        }
        return appearance;
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
}
