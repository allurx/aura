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

import AppearanceApplier from "@/component/setting/application/appearance-applier";
import ExternalSettingListener from "@/component/setting/application/external-setting-listener";
import ExternalSettingSynchronizer from "@/component/setting/application/external-setting-synchronizer";
import SettingUiListener from "@/component/setting/ui/setting-ui-listener";
import Setting from "@/component/setting/definition/setting";
import SettingCatalog from "@/component/setting/definition/setting-catalog";
import PageAppearance from "@/component/setting/model/page-appearance";
import SettingConfiguration from "@/component/setting/model/setting-configuration";
import SettingInteraction from "@/component/setting/model/setting-interaction";
import SettingTarget from "@/component/setting/model/setting-target";
import AppearanceRepository from "@/component/setting/persistence/appearance-repository";
import SettingUi from "@/component/setting/ui/setting-ui";
import { PageName } from "@/constant/page-name";

/**
 * 单个页面已提交 Appearance 的唯一状态所有者。
 *
 * 负责协调同步持久化、DOM 投影、设置面板及面板外部变化。
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
        targets,
    }: {
        pageName: PageName;
        container: HTMLElement;
        targets: readonly SettingTarget[];
    }) {
        this.settingUi = new SettingUi(container);
        this.configuration = new SettingConfiguration(pageName, [
            ...targets,
            new SettingTarget(this.settingUi, [
                SettingCatalog.FONT_SIZE,
                SettingCatalog.COLOR,
                SettingCatalog.BACKGROUND_COLOR,
            ]),
        ]);
        this.repository = new AppearanceRepository(this.configuration);
        this.applier = new AppearanceApplier(this.configuration);
        this.appearance = PageAppearance.defaults(this.configuration.defaultTheme);
    }

    /**
     * 在页面初始化的首个异步让出前加载、应用并绑定 Appearance。
     *
     * @param signal - 页面生命周期信号
     */
    public init(signal: AbortSignal): void {
        if (signal.aborted) return;
        this.appearance = this.repository.load();
        this.applier.apply(this.appearance);
        this.settingUi.init(this.configuration, this, signal);
        this.externalSynchronizer.start(this.configuration, this, signal);
    }

    public toggle(opener: HTMLElement): void {
        this.settingUi.toggle(opener);
    }

    public getValue(target: SettingTarget, setting: Setting): string | undefined {
        return setting.read(this.appearance, target);
    }

    public isPreviewing(target: SettingTarget, setting: Setting): boolean {
        return this.settingUi.isPreviewing(target, setting);
    }

    public preview(interaction: SettingInteraction): void {
        this.applier.applyInteraction(interaction);
    }

    public restore(target: SettingTarget, setting: Setting): void {
        this.applier.restore(this.appearance, target, setting);
    }

    public commit(interaction: SettingInteraction): void {
        const previousAppearance = this.appearance;
        const nextAppearance = interaction.setting.update(previousAppearance, interaction.target, interaction.value);
        try {
            this.applier.applyInteraction(interaction);
            this.repository.save(nextAppearance);
            this.appearance = nextAppearance;
        } catch (error) {
            this.applier.restore(previousAppearance, interaction.target, interaction.setting);
            throw error;
        }
    }

    public commitExternalChange(interaction: SettingInteraction): void {
        this.commit(interaction);
        this.settingUi.refresh();
    }

    public reset(): void {
        this.externalSynchronizer.cancelPending();
        const previousAppearance = this.appearance;
        const defaultAppearance = PageAppearance.defaults(this.configuration.defaultTheme);
        try {
            this.applier.apply(defaultAppearance);
            this.repository.reset();
            this.appearance = defaultAppearance;
        } catch (error) {
            this.applier.apply(previousAppearance);
            throw error;
        }
    }
}
