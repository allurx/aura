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
    private readonly layoutChanges = new EventTarget();
    private signal: AbortSignal | undefined;

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
        this.signal = signal;

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
                        this.commit(width, value);
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
                this.save(this.appearance.withPanel(name, bounds), [], false, name);
            },
            subscribe: (listener, signal) => {
                this.layoutChanges.addEventListener(name, listener, { signal });
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
            commit: (value: Partial<ReaderToolsAppearance>): void => {
                this.save(
                    this.appearance.withToolbar({ collapsed: false, ...this.appearance.getToolbar(), ...value }),
                    [],
                    false,
                    "toolbar"
                );
            },
            subscribe: (listener: () => void, signal: AbortSignal): void => {
                this.layoutChanges.addEventListener("toolbar", listener, { signal });
            },
        };
    }

    /**
     * 保存成功后更新快照，失败时恢复提交前的页面与控件。
     */
    public commit(setting: Setting, value: string): void {
        this.requireSetting(setting);
        try {
            this.save(setting.update(this.appearance, value), [setting]);
        } catch (error) {
            let failure: unknown = error;
            // 原生 resize 已经写入 inline 样式；保存失败时恢复已提交的宽度。
            if (setting === this.width && !this.signal?.aborted) {
                try {
                    setting.apply(setting.read(this.appearance));
                } catch (restoreError) {
                    failure = new AggregateError([error, restoreError], "Failed to save and restore native width", {
                        cause: restoreError,
                    });
                }
            }
            this.refreshAfterOperation([setting], failure);
            throw failure;
        }
    }

    /**
     * 重置单项，其他已提交设置保持不变。
     */
    public resetSetting(setting: Setting): void {
        this.requireSetting(setting);
        this.resetSettings([setting]);
    }

    /**
     * 清除常规设置的显式值，保留当前页面主题。
     */
    public resetGeneral(): void {
        this.resetSettings(this.configuration.general, true);
    }

    /**
     * 清除当前页面全部设置，不影响另一页面。
     */
    public reset(): void {
        this.widthSynchronizer?.cancelPending();
        this.save(PageAppearance.defaults(this.configuration.defaultTheme), this.configuration.settings, true);
    }

    /**
     * 操作结束后刷新控件；同时失败时保留操作和刷新异常。
     */
    private refreshAfterOperation(settings: readonly Setting[], error?: unknown): void {
        if (this.signal?.aborted) return;
        try {
            this.settingUi.refresh(settings);
        } catch (refreshError) {
            if (error !== undefined) {
                throw new AggregateError([error, refreshError], "Setting update and refresh failed", {
                    cause: refreshError,
                });
            }
            throw refreshError;
        }
    }

    /**
     * 一次保存重置结果，并确保旧 resize 值不会延迟写回。
     */
    private resetSettings(settings: readonly Setting[], resetLayout = false): void {
        if (settings.length === 0) return;
        if (this.width && settings.includes(this.width)) this.widthSynchronizer?.cancelPending();
        let next = this.appearance;
        for (const setting of settings) next = setting.reset(next, this.configuration.defaultTheme);
        this.save(resetLayout ? next.withoutLayout() : next, settings);
    }

    /**
     * 同步保存当前页面的完整快照后再应用，区分保存失败与已保存但界面未更新。
     */
    private save(
        next: PageAppearance,
        settings: readonly Setting[],
        removeSnapshot = false,
        ownLayout?: PanelName | "toolbar"
    ): void {
        try {
            if (removeSnapshot) this.repository.reset();
            else if (JSON.stringify(this.appearance) !== JSON.stringify(next)) this.repository.save(next);
        } catch (error) {
            throw new OperationError(
                "外观设置未能保存",
                "本次调整未保存，页面继续使用之前的外观。",
                error,
                "请处理失败原因后重新调整。"
            );
        }
        const previous = this.appearance;
        this.appearance = next;
        // 页面退出时仍保存原生 resize 的最后输入，但不重新启用已清理的界面观察器。
        if (this.signal?.aborted) return;
        try {
            for (const setting of this.configuration.settings) {
                if (setting.read(previous) !== setting.read(next)) setting.apply(setting.read(next));
            }
            this.notifyLayoutChanges(previous, ownLayout);
            if (settings.length === 0) this.settingUi.refreshResetState();
            else this.refreshAfterOperation(settings);
        } catch (error) {
            throw new OperationError(
                "外观已保存，界面尚未更新",
                "本次设置已经保存，但当前页面未能完整应用。",
                error,
                "请重新打开当前页面，无需再次保存相同设置。"
            );
        }
    }

    /**
     * 当前拖动由所属控件完成；页面内重置同时通知相关面板与工具栏。
     */
    private notifyLayoutChanges(previous: PageAppearance, ownLayout?: PanelName | "toolbar"): void {
        for (const name of ["settings", "toc"] as const) {
            if (
                name !== ownLayout &&
                JSON.stringify(previous.getPanel(name)) !== JSON.stringify(this.appearance.getPanel(name))
            )
                this.layoutChanges.dispatchEvent(new Event(name));
        }
        if (
            ownLayout !== "toolbar" &&
            JSON.stringify(previous.getToolbar()) !== JSON.stringify(this.appearance.getToolbar())
        )
            this.layoutChanges.dispatchEvent(new Event("toolbar"));
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
