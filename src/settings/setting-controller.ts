/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import WidthSynchronizer from "./application/width-synchronizer";
import type SettingUiListener from "./ui/setting-ui-listener";
import type Setting from "./definitions/setting";
import WidthSetting from "./definitions/width-setting";
import PageAppearance from "./models/page-appearance";
import SettingConfiguration, { type PageSettings } from "./models/setting-configuration";
import AppearanceRepository from "./persistence/appearance-repository";
import SettingUi from "./ui/setting-ui";
import type { PageName } from "@/constants/page-name";

/**
 * 页面已提交外观的唯一状态所有者，协调存储、预览与外部宽度变化。
 *
 */
export default class SettingController implements SettingUiListener {
    private readonly settingUi: SettingUi;
    private readonly configuration: SettingConfiguration;
    private readonly repository: AppearanceRepository;
    private readonly width: WidthSetting | undefined;
    private readonly widthSynchronizer: WidthSynchronizer | undefined;
    private appearance: PageAppearance;

    public constructor({
        pageName,
        container,
        settings,
    }: {
        pageName: PageName;
        container: HTMLElement;
        settings: PageSettings;
    }) {
        this.settingUi = new SettingUi(container);
        this.configuration = new SettingConfiguration(pageName, settings);
        this.repository = new AppearanceRepository(this.configuration);
        this.width = settings.general.find((setting): setting is WidthSetting => setting instanceof WidthSetting);
        this.widthSynchronizer = this.width ? new WidthSynchronizer(this.width) : undefined;
        this.appearance = PageAppearance.defaults(this.configuration.defaultTheme);
    }

    /**
     * 在页面首个 await 前同步恢复外观，再绑定控件与外部变化。
     */
    public init(signal: AbortSignal): void {
        if (signal.aborted) return;

        this.appearance = this.repository.load();
        document.documentElement.dataset["page"] = this.configuration.pageName;
        for (const setting of this.configuration.settings) this.restore(setting);
        this.settingUi.init(this.configuration, this, signal);

        const width = this.width;
        if (width) {
            this.widthSynchronizer?.start(
                {
                    getValue: () => this.getValue(width),
                    isPreviewing: () => this.settingUi.isPreviewing(width),
                    commit: (value) => {
                        this.commit(width, value);
                        this.settingUi.refresh();
                    },
                },
                signal
            );
        }
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

    public preview(setting: Setting, value: string): void {
        this.requireSetting(setting);
        if (!setting.accepts(value)) throw new Error(`Invalid ${setting.key} setting value`);
        setting.apply(value);
    }

    public restore(setting: Setting): void {
        setting.apply(setting.read(this.appearance));
    }

    /**
     * 保存成功后才更新快照，失败时恢复提交前的界面。
     */
    public commit(setting: Setting, value: string): void {
        this.requireSetting(setting);
        this.save(setting.update(this.appearance, value), [setting]);
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
        this.resetSettings(this.configuration.general);
    }

    /**
     * 清除当前页面全部设置，不影响另一页面。
     */
    public reset(): void {
        this.widthSynchronizer?.cancelPending();
        this.save(PageAppearance.defaults(this.configuration.defaultTheme), this.configuration.settings, true);
    }

    /**
     * 一次保存重置结果，并确保旧 resize 值不会延迟写回。
     */
    private resetSettings(settings: readonly Setting[]): void {
        if (settings.length === 0) return;
        if (this.width && settings.includes(this.width)) this.widthSynchronizer?.cancelPending();
        let nextAppearance = this.appearance;
        for (const setting of settings) {
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
            for (const setting of settings) setting.apply(setting.read(nextAppearance));
            if (removeSnapshot) this.repository.reset();
            else this.repository.save(nextAppearance);
            this.appearance = nextAppearance;
        } catch (error) {
            const restoreErrors: unknown[] = [];
            for (const setting of settings) {
                try {
                    setting.apply(setting.read(previousAppearance));
                } catch (restoreError) {
                    restoreErrors.push(restoreError);
                }
            }
            if (restoreErrors.length > 0) {
                // eslint-disable-next-line preserve-caught-error -- AggregateError.errors 已按顺序保留原始异常与全部恢复异常。
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
