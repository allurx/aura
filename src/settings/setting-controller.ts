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
import RangeStyleSetting from "./definitions/range-style-setting";
import { run } from "@/utils/event-util";

/**
 * 统一管理页面已提交外观、预览与取消状态，协调持久化和外部宽度变化。
 */
export default class SettingController implements SettingUiListener {
    private readonly settingUi: SettingUi;
    private readonly configuration: SettingConfiguration;
    private readonly repository: AppearanceRepository;
    private readonly width: WidthSetting | undefined;
    private readonly widthSynchronizer: WidthSynchronizer | undefined;
    private readonly previews = new Map<Setting, string>();
    private readonly pendingPreviewTimers = new Map<Setting, number>();
    private readonly cancelledSettings = new Set<Setting>();
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
        for (const setting of this.configuration.settings) setting.apply(setting.read(this.appearance));

        // 页面销毁只丢弃会话，不再向即将移除的 DOM 恢复预览。
        signal.addEventListener(
            "abort",
            () => {
                this.cancelPendingPreviews();
                this.previews.clear();
                this.cancelledSettings.clear();
            },
            { once: true }
        );
        this.settingUi.init(this.configuration, this, signal);

        const width = this.width;
        if (width) {
            this.widthSynchronizer?.start(
                {
                    getValue: () => width.read(this.appearance),
                    isPreviewing: () => this.previews.has(width),
                    commit: (value) => {
                        // 原生拖动是独立操作，不受已取消控件的迟到 change 标记影响。
                        this.performAndRefresh(() => {
                            this.save(width.update(this.appearance, value), [width]);
                        });
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
        return this.previews.get(setting) ?? setting.read(this.appearance);
    }

    public preview(setting: Setting, value: string): void {
        this.requireSetting(setting);
        if (!setting.accepts(value)) throw new Error(`Invalid ${setting.key} setting value`);

        // 新 input 开始下一轮预览，解除上一轮取消留下的提交屏蔽。
        this.cancelledSettings.delete(setting);
        this.previews.set(setting, value);

        // 滑块与数值即时响应；暂停拖动后再重排页面，避免每次指针移动都阻塞下一次输入。
        if (setting instanceof RangeStyleSetting) {
            this.cancelPendingPreview(setting);
            this.pendingPreviewTimers.set(
                setting,
                window.setTimeout(() => {
                    this.pendingPreviewTimers.delete(setting);
                    run(() => {
                        setting.apply(value);
                    });
                }, 100)
            );
        } else setting.apply(value);
        this.settingUi.refresh(setting);
    }

    /**
     * 忽略已取消预览的迟到 change；保存成功后才更新快照，失败时恢复提交前的界面。
     */
    public commit(setting: Setting, value: string): void {
        this.requireSetting(setting);
        this.cancelPendingPreview(setting);
        if (this.cancelledSettings.has(setting)) return;
        this.previews.delete(setting);
        this.performAndRefresh(() => {
            this.save(setting.update(this.appearance, value), [setting]);
        });
    }

    /**
     * 关闭面板前恢复已提交值，并同步控件；取消标记保留至该项的下一次 input。
     */
    public cancelPreviews(): void {
        this.performAndRefresh(() => {
            this.restorePreviews();
        });
    }

    /**
     * 撤销未提交预览，再重置单项；其他已提交设置保持不变。
     */
    public resetSetting(setting: Setting): void {
        this.requireSetting(setting);
        this.performAndRefresh(() => {
            this.restorePreviews();
            this.resetSettings([setting]);
        });
    }

    /**
     * 清除常规设置的显式值，保留当前页面主题。
     */
    public resetGeneral(): void {
        this.performAndRefresh(() => {
            this.restorePreviews();
            this.resetSettings(this.configuration.general);
        });
    }

    /**
     * 清除当前页面全部设置，不影响另一页面。
     */
    public reset(): void {
        this.performAndRefresh(() => {
            this.restorePreviews();
            this.widthSynchronizer?.cancelPending();
            this.save(PageAppearance.defaults(this.configuration.defaultTheme), this.configuration.settings, true);
        });
    }

    /**
     * 逐项恢复全部预览；单项失败不能阻止其他设置及会话的清理。
     */
    private restorePreviews(): void {
        this.cancelPendingPreviews();
        const errors: unknown[] = [];
        for (const setting of this.previews.keys()) {
            this.cancelledSettings.add(setting);
            try {
                setting.apply(setting.read(this.appearance));
            } catch (error) {
                errors.push(error);
            }
        }
        this.previews.clear();
        if (errors.length === 1) throw errors[0];
        if (errors.length > 1) throw new AggregateError(errors, "Failed to restore settings previews");
    }

    /**
     * 同一滑块的新输入或提交替换尚未应用的预览。
     */
    private cancelPendingPreview(setting: Setting): void {
        const timer = this.pendingPreviewTimers.get(setting);
        if (timer === undefined) return;
        window.clearTimeout(timer);
        this.pendingPreviewTimers.delete(setting);
    }

    /**
     * 关闭、重置与页面销毁都取消延迟应用，避免旧预览在之后覆盖页面。
     */
    private cancelPendingPreviews(): void {
        for (const timer of this.pendingPreviewTimers.values()) window.clearTimeout(timer);
        this.pendingPreviewTimers.clear();
    }

    /**
     * 操作结束后刷新控件；同时失败时保留操作和刷新异常。
     */
    private performAndRefresh(action: () => void): void {
        try {
            action();
        } catch (error) {
            try {
                this.settingUi.refresh();
            } catch (refreshError) {
                // eslint-disable-next-line preserve-caught-error -- AggregateError.errors 同时保留操作异常与刷新异常。
                throw new AggregateError([error, refreshError], "Setting update and refresh failed");
            }
            throw error;
        }
        this.settingUi.refresh();
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
