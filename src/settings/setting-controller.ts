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
import OperationError from "@/errors/operation-error";
import type { PanelFrameBinding } from "@/components/dialog/panel-frame";
import type { PanelName } from "./models/page-appearance";
import type { ReaderToolsAppearance } from "./models/page-appearance";

/**
 * 管理页面已提交外观，协调持久化、失败恢复和外部宽度变化。
 */
export default class SettingController implements SettingUiListener {
    private readonly settingUi: SettingUi;
    private readonly configuration: SettingConfiguration;
    private readonly repository: AppearanceRepository;
    private readonly width: WidthSetting | undefined;
    private readonly widthSynchronizer: WidthSynchronizer | undefined;
    private appearance: PageAppearance;
    private toolbarChanged: (() => void) | undefined;

    public constructor({
        pageName,
        container,
        opener,
        settings,
        canOpen = () => true,
    }: {
        pageName: PageName;
        container: HTMLElement;
        opener: HTMLButtonElement;
        settings: PageSettings;
        canOpen?: () => boolean;
    }) {
        this.settingUi = new SettingUi(container, opener, canOpen);
        this.configuration = new SettingConfiguration(pageName, settings);
        this.repository = new AppearanceRepository(this.configuration);
        this.width = this.configuration.general.find(
            (setting): setting is WidthSetting => setting instanceof WidthSetting
        );
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
        for (const setting of this.configuration.settings) setting.apply(setting.read(this.appearance));

        this.settingUi.init(this.configuration, this, signal);

        const width = this.width;
        if (width) {
            this.widthSynchronizer?.start(
                {
                    getValue: () => width.read(this.appearance),
                    commit: (value) => {
                        this.performAndRefresh([width], () => {
                            this.save(width.update(this.appearance, value), [width]);
                        });
                    },
                },
                signal
            );
        }
    }

    public getValue(setting: Setting): string | undefined {
        return setting.read(this.appearance);
    }

    /**
     * 面板与控件使用同一页面快照，拖动保存不会覆盖同时生效的主题或其他设置。
     */
    public getPanelFrame(name: PanelName): PanelFrameBinding {
        return {
            getValue: () => this.appearance.getPanel(name),
            commit: (bounds) => {
                const previous = this.appearance.getPanel(name);
                if (
                    previous?.left === bounds?.left &&
                    previous?.top === bounds?.top &&
                    previous?.width === bounds?.width &&
                    previous?.height === bounds?.height
                )
                    return;
                const next = this.appearance.withPanel(name, bounds);
                this.save(next, []);
                this.settingUi.refreshResetState();
            },
        };
    }

    /**
     * 浮层布局同样属于常规外观，单独调整后也应能使用常规重置。
     */
    public hasCustomLayout(): boolean {
        return this.appearance.hasCustomLayout();
    }

    /**
     * 阅读工具栏共用页面外观保存；重置时通知当前界面，其他设置不会覆盖工具栏偏好。
     */
    public getToolbarBinding() {
        return {
            getValue: (): ReaderToolsAppearance => this.appearance.getToolbar() ?? { collapsed: false },
            commit: (value: ReaderToolsAppearance): void => {
                const previous = this.appearance.getToolbar();
                if (
                    (previous?.collapsed ?? false) === value.collapsed &&
                    previous?.position?.left === value.position?.left &&
                    previous?.position?.top === value.position?.top
                )
                    return;
                this.save(this.appearance.withToolbar(value), []);
                this.settingUi.refreshResetState();
            },
            subscribe: (listener: () => void, signal: AbortSignal): void => {
                this.toolbarChanged = listener;
                signal.addEventListener(
                    "abort",
                    () => {
                        this.toolbarChanged = undefined;
                    },
                    { once: true }
                );
            },
        };
    }

    /**
     * 保存成功后更新快照，失败时恢复提交前的页面与控件。
     */
    public commit(setting: Setting, value: string): void {
        this.requireSetting(setting);
        this.performAndRefresh([setting], () => {
            const nextAppearance = setting.update(this.appearance, value);
            // 原生 input 后的 change 常携带同一值，不重复应用样式或写入存储。
            if (setting.read(nextAppearance) !== setting.read(this.appearance)) this.save(nextAppearance, [setting]);
        });
    }

    /**
     * 重置单项，其他已提交设置保持不变。
     */
    public resetSetting(setting: Setting): void {
        this.requireSetting(setting);
        this.performAndRefresh([setting], () => {
            this.resetSettings([setting]);
        });
    }

    /**
     * 清除常规设置的显式值，保留当前页面主题。
     */
    public resetGeneral(): void {
        this.performAndRefresh(this.configuration.general, () => {
            this.resetSettings(this.configuration.general, true);
        });
    }

    /**
     * 清除当前页面全部设置，不影响另一页面。
     */
    public reset(): void {
        this.performAndRefresh(this.configuration.settings, () => {
            this.widthSynchronizer?.cancelPending();
            this.save(PageAppearance.defaults(this.configuration.defaultTheme), this.configuration.settings, true);
        });
    }

    /**
     * 操作结束后刷新控件；同时失败时保留操作和刷新异常。
     */
    private performAndRefresh(settings: readonly Setting[], action: () => void): void {
        try {
            action();
        } catch (error) {
            try {
                this.settingUi.refresh(settings);
            } catch (refreshError) {
                // eslint-disable-next-line preserve-caught-error -- AggregateError.errors 同时保留操作异常与刷新异常。
                throw new AggregateError([error, refreshError], "Setting update and refresh failed");
            }
            throw error;
        }
        this.settingUi.refresh(settings);
    }

    /**
     * 一次保存重置结果，并确保旧 resize 值不会延迟写回。
     */
    private resetSettings(settings: readonly Setting[], resetLayout = false): void {
        if (settings.length === 0) return;
        if (this.width && settings.includes(this.width)) this.widthSynchronizer?.cancelPending();
        let nextAppearance = this.appearance;
        for (const setting of settings) {
            nextAppearance = setting.reset(nextAppearance, this.configuration.defaultTheme);
        }
        if (resetLayout) nextAppearance = nextAppearance.withoutLayout();
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
            throw new OperationError(
                "外观设置未能保存",
                restoreErrors.length > 0
                    ? "本次调整未保存，界面也未能完全恢复之前的外观。"
                    : "本次调整未保存，已恢复之前的外观。",
                restoreErrors.length > 0
                    ? new AggregateError([error, ...restoreErrors], "Failed to save and restore appearance settings", {
                          cause: error,
                      })
                    : error,
                restoreErrors.length > 0 ? "请重新打开当前页面后再调整。" : "请处理失败原因后重新调整。"
            );
        }
        if (previousAppearance.getToolbar() !== nextAppearance.getToolbar()) this.toolbarChanged?.();
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
