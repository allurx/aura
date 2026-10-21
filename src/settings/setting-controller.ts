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
import { run } from "@/utils/event-util";

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
    private readonly pendingInputs = new Map<Setting, number>();
    private inputVersion = 0;

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
        this.repository.subscribe(() => {
            run(() => {
                this.refreshExternalAppearance();
            });
        }, signal);

        const width = this.width;
        if (width) {
            this.widthSynchronizer?.start(
                {
                    getValue: () => width.read(this.appearance),
                    commit: (value) => this.commit(width, value),
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
            commit: (bounds) => this.save((current) => current.withPanel(name, bounds), false, name),
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
            commit: (value: Partial<ReaderToolsAppearance>): Promise<void> =>
                this.save(
                    (current) => current.withToolbar({ collapsed: false, ...current.getToolbar(), ...value }),
                    false,
                    "toolbar"
                ),
            subscribe: (listener: () => void, signal: AbortSignal): void => {
                this.layoutChanges.addEventListener("toolbar", listener, { signal });
            },
        };
    }

    /**
     * 保存成功后更新快照，失败时恢复提交前的页面与控件。
     */
    public async commit(setting: Setting, value: string): Promise<void> {
        this.requireSetting(setting);
        const version = ++this.inputVersion;
        this.pendingInputs.set(setting, version);
        let failure: unknown;
        try {
            // 锁等待期间的新 input 替代同一控件的旧输入，避免排队值使滑块和页面倒退。
            await this.save((current) =>
                this.pendingInputs.get(setting) === version ? setting.update(current, value) : current
            );
        } catch (error) {
            failure = error;
            // 原生 resize 已经写入 inline 样式；只恢复仍属于本次失败的最新输入。
            if (setting === this.width && this.pendingInputs.get(setting) === version && !this.signal?.aborted) {
                try {
                    setting.apply(setting.read(this.appearance));
                } catch (restoreError) {
                    failure = new AggregateError([error, restoreError], "Failed to save and restore native width", {
                        cause: restoreError,
                    });
                }
            }
            throw failure;
        } finally {
            if (this.pendingInputs.get(setting) === version) {
                this.pendingInputs.delete(setting);
                this.refreshAfterOperation([setting], failure);
            }
        }
    }

    /**
     * 重置单项，其他已提交设置保持不变。
     */
    public async resetSetting(setting: Setting): Promise<void> {
        this.requireSetting(setting);
        await this.resetSettings([setting]);
    }

    /**
     * 清除常规设置的显式值，保留当前页面主题。
     */
    public async resetGeneral(): Promise<void> {
        await this.resetSettings(this.configuration.general, true);
    }

    /**
     * 清除当前页面全部设置，不影响另一页面。
     */
    public async reset(): Promise<void> {
        this.widthSynchronizer?.cancelPending();
        this.pendingInputs.clear();
        await this.save(() => PageAppearance.defaults(this.configuration.defaultTheme), true);
    }

    /**
     * 操作结束后刷新控件；同时失败时保留操作和刷新异常。
     */
    private refreshAfterOperation(settings: readonly Setting[], error?: unknown): void {
        if (this.signal?.aborted) return;
        try {
            this.settingUi.refresh(settings.filter((setting) => !this.pendingInputs.has(setting)));
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
    private async resetSettings(settings: readonly Setting[], resetLayout = false): Promise<void> {
        if (settings.length === 0) return;
        if (this.width && settings.includes(this.width)) this.widthSynchronizer?.cancelPending();
        for (const setting of settings) this.pendingInputs.delete(setting);
        await this.save((current) => {
            let next = current;
            for (const setting of settings) next = setting.reset(next, this.configuration.defaultTheme);
            return resetLayout ? next.withoutLayout() : next;
        });
    }

    /**
     * 只在锁内保存最新快照；排版和控件刷新在释放锁后执行，失败结果区分未保存与界面未更新。
     */
    private async save(
        update: (current: PageAppearance) => PageAppearance,
        removeSnapshot = false,
        ownLayout?: PanelName | "toolbar"
    ): Promise<void> {
        try {
            await this.repository.transact((current) => {
                const nextAppearance = update(current);
                if (removeSnapshot) this.repository.reset();
                else if (JSON.stringify(current) !== JSON.stringify(nextAppearance))
                    this.repository.save(nextAppearance);
            });
        } catch (error) {
            const failure = new OperationError(
                "外观设置未能保存",
                "本次调整未保存，页面继续使用之前的外观。",
                error,
                "请处理失败原因后重新调整。"
            );
            this.refreshAfterOperation(this.configuration.settings, failure);
            throw failure;
        }
        if (this.signal?.aborted) return;
        try {
            this.refreshExternalAppearance(ownLayout);
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
     * 外部提交只更新确实改变的设置；已退出的页面不再应用样式或移动焦点。
     */
    private refreshExternalAppearance(ownLayout?: PanelName | "toolbar"): void {
        if (this.signal?.aborted) return;
        const previous = this.appearance;
        const next = this.repository.load();
        const changed = this.configuration.settings.filter((setting) => setting.read(previous) !== setting.read(next));
        this.appearance = next;
        for (const setting of changed) setting.apply(setting.read(next));
        this.notifyLayoutChanges(previous, ownLayout);
        if (changed.length === 0) this.settingUi.refreshResetState();
        else this.refreshAfterOperation(changed);
    }

    /**
     * 当前拖动由所属控件完成；其他面板、工具栏和跨标签更新收到相同的布局通知。
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
