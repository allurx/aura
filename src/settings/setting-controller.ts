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

import AppearanceApplier from "./application/appearance-applier";
import type ExternalSettingListener from "./application/external-setting-listener";
import ExternalSettingSynchronizer from "./application/external-setting-synchronizer";
import type SettingUiListener from "./ui/setting-ui-listener";
import type Setting from "./definitions/setting";
import PageAppearance from "./models/page-appearance";
import SettingConfiguration from "./models/setting-configuration";
import AppearanceRepository from "./persistence/appearance-repository";
import SettingUi from "./ui/setting-ui";
import type { PageName } from "@/constants/page-name";

/**
 * 页面已提交外观的唯一状态所有者，协调存储、预览与外部宽度变化。
 *
 * @author allurx
 */
export default class SettingController implements SettingUiListener, ExternalSettingListener {
    private readonly settingUi: SettingUi;
    private readonly configuration: SettingConfiguration;
    private readonly repository: AppearanceRepository;
    private readonly applier: AppearanceApplier;
    private readonly externalSynchronizer = new ExternalSettingSynchronizer();
    private appearance: PageAppearance;

    public constructor({
        pageName,
        container,
        settings,
        inertElements = [],
    }: {
        pageName: PageName;
        container: HTMLElement;
        settings: readonly Setting[];
        inertElements?: readonly HTMLElement[];
    }) {
        this.settingUi = new SettingUi(container, inertElements);
        this.configuration = new SettingConfiguration(pageName, settings);
        this.repository = new AppearanceRepository(this.configuration);
        this.applier = new AppearanceApplier(this.configuration);
        this.appearance = PageAppearance.defaults(this.configuration.defaultTheme);
    }

    /**
     * 在页面首个 await 前同步恢复外观，再绑定控件与外部变化。
     */
    public init(signal: AbortSignal): void {
        if (signal.aborted) return;

        this.appearance = this.repository.load();
        this.applier.apply(this.appearance);
        this.settingUi.init(this.configuration, this, signal);
        this.externalSynchronizer.start(this.configuration, this, signal);
    }

    /**
     * 切换设置面板，关闭时将焦点归还到指定入口。
     */
    public toggle(opener: HTMLElement, returnFocusTarget = opener): void {
        this.settingUi.toggle(opener, returnFocusTarget);
    }

    public getValue(setting: Setting): string | undefined {
        return setting.read(this.appearance);
    }

    public isPreviewing(setting: Setting): boolean {
        return this.settingUi.isPreviewing(setting);
    }

    public preview(setting: Setting, value: string): void {
        this.requireSetting(setting);
        if (!setting.accepts(value)) throw new Error(`Invalid ${setting.key} setting value`);
        setting.apply(value);
    }

    public restore(setting: Setting): void {
        this.applier.restore(this.appearance, setting);
    }

    /**
     * 保存成功后才更新快照，失败时恢复提交前的界面。
     */
    public commit(setting: Setting, value: string): void {
        this.requireSetting(setting);
        this.save(setting.update(this.appearance, value), [setting]);
    }

    public commitExternalChange(setting: Setting, value: string): void {
        this.commit(setting, value);
        this.settingUi.refresh();
    }

    /**
     * 重置单项并取消它尚未提交的外部变化。
     */
    public resetSetting(setting: Setting): void {
        this.requireSetting(setting);
        this.resetSettings([setting]);
    }

    /**
     * 清除常规设置的显式值，保留当前页面主题。
     */
    public resetGeneral(): void {
        this.resetSettings(
            this.configuration.settings.filter((setting) => setting !== this.configuration.themeSetting)
        );
    }

    /**
     * 清除当前页面全部设置，不影响另一页面。
     */
    public reset(): void {
        this.externalSynchronizer.cancelPending();
        this.save(PageAppearance.defaults(this.configuration.defaultTheme), this.configuration.settings, true);
    }

    /**
     * 一次保存重置结果，并确保旧 resize 值不会延迟写回。
     */
    private resetSettings(settings: readonly Setting[]): void {
        if (settings.length === 0) return;
        let nextAppearance = this.appearance;
        for (const setting of settings) {
            this.externalSynchronizer.cancelPending(setting);
            nextAppearance = setting.reset(nextAppearance, this.configuration.defaultTheme);
        }
        this.save(nextAppearance, settings);
    }

    /**
     * 将本次涉及的设置应用并持久化；逐项回滚保留原始异常与全部恢复异常。
     */
    private save(nextAppearance: PageAppearance, settings: readonly Setting[], removeSnapshot = false): void {
        const previousAppearance = this.appearance;
        try {
            for (const setting of settings) this.applier.restore(nextAppearance, setting);
            if (removeSnapshot) this.repository.reset();
            else this.repository.save(nextAppearance);
            this.appearance = nextAppearance;
        } catch (error) {
            const restoreErrors: unknown[] = [];
            for (const setting of settings) {
                try {
                    this.applier.restore(previousAppearance, setting);
                } catch (restoreError) {
                    restoreErrors.push(restoreError);
                }
            }
            if (restoreErrors.length > 0) {
                throw new AggregateError([error, ...restoreErrors], "Failed to save and restore appearance settings");
            }
            throw error;
        }
    }

    /**
     * 交互仅允许使用当前页面清单中的定义实例。
     */
    private requireSetting(setting: Setting): void {
        if (!this.configuration.settings.includes(setting)) {
            throw new Error(`Unsupported setting: ${setting.key}`);
        }
    }
}
