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

import Ui from "@/component/ui";
import { UiId } from "@/component/ui-id";
import { PageName } from "@/constant/page-name";
import Setting from "@/domain/setting/setting";
import SettingService from "@/domain/setting/setting-service";
import { isTheme, SettingItemChange, SettingKey, SettingValueMap, THEME_SETTING_KEY, UiSettingChange } from "./setting-change";
import SettingUi, { SettingItemConstructor, UiSettingItemMap } from "./setting-ui";

/**
 * 单个页面的设置控制器。
 * 统一管理页面设置的加载、预览同步、持久化和重置。
 * @author allurx
 */
export default class SettingController {
    private readonly settings = new Map<UiId, Setting>();
    private readonly settingUi: SettingUi;
    private readonly settingService = new SettingService();

    public constructor({
        pageName,
        container,
        uiSettingItemMap,
    }: {
        pageName: PageName;
        container: HTMLElement;
        uiSettingItemMap: UiSettingItemMap;
    }) {
        this.pageName = pageName;
        this.settingUi = new SettingUi({ container, uiSettingItemMap });
    }

    private readonly pageName: PageName;

    /**
     * 加载、应用并绑定当前页面的设置。
     */
    public async init(signal: AbortSignal): Promise<void> {
        const settings = await this.settingService.loadPage(this.pageName);
        if (signal.aborted) return;

        settings.forEach((setting) => this.settings.set(setting.uiId, setting));
        this.settingUi
            .renderAside()
            .applySettings(this.settings)
            .bindNodeClick(this.settings, signal)
            .bindCloseSetting(signal)
            .bindResetSetting(() => this.reset(), signal)
            .bindSettingCommit((change) => this.commit(change), signal);
    }

    public toggle(): this {
        this.settingUi.toggleSetting();
        return this;
    }

    public getValue<K extends SettingKey>(uiId: UiId, key: K): SettingValueMap[K] | undefined {
        const value = this.settings.get(uiId)?.[key];
        if (key === THEME_SETTING_KEY) {
            return (isTheme(value) ? value : undefined) as SettingValueMap[K] | undefined;
        }
        return (typeof value === "string" ? value : undefined) as SettingValueMap[K] | undefined;
    }

    public isPreviewing(ui: Ui, key: SettingKey): boolean {
        return this.settingUi.isPreviewing(ui, key);
    }

    /**
     * 提交由设置面板之外的交互产生的设置变化。
     */
    public async commitExternal(ui: Ui, change: SettingItemChange): Promise<void> {
        this.settingUi.previewExternal(ui, change);
        await this.commit({ ...change, ui });
    }

    private async commit(change: UiSettingChange): Promise<void> {
        const now = Date.now();
        const setting =
            this.settings.get(change.ui.id) ??
            new Setting({
                id: crypto.randomUUID(),
                pageName: this.pageName,
                uiId: change.ui.id,
                createdTime: now,
                updatedTime: now,
            });

        Object.assign(setting, { [change.key]: change.value });
        setting.updatedTime = now;
        this.settings.set(change.ui.id, setting);
        await this.settingService.save(setting);
    }

    private async reset(): Promise<void> {
        this.settingUi.resetSettings();
        this.settings.clear();
        await this.settingService.resetPage(this.pageName);
    }
}

export type { SettingItemConstructor };
