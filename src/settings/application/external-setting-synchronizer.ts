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

import type Setting from "../definitions/setting";
import type SettingConfiguration from "../models/setting-configuration";
import SettingInteraction from "../models/setting-interaction";
import type SettingTarget from "../models/setting-target";
import EventUtil from "@/utils/event-util";
import type ExternalSettingListener from "./external-setting-listener";

/**
 * 将 resize 等面板外部产生的 inline Appearance 变化同步到已提交快照。
 *
 * 只跟踪具体的 inline preferred value；外部移除该值不等同于设置 Reset，不会提交。
 *
 * @author allurx
 */
export default class ExternalSettingSynchronizer {
    private readonly timers = new Set<number>();

    /**
     * 只观察明确声明外部变化能力的设置，并随页面退出取消待提交任务。
     *
     * @param configuration - 当前页面开放的设置目标
     * @param listener - 提供预览状态与已提交值的协调器
     * @param signal - 观察器与延迟提交共同使用的页面生命周期
     */
    public start(configuration: SettingConfiguration, listener: ExternalSettingListener, signal: AbortSignal): void {
        for (const target of configuration.targets) {
            for (const setting of target.settings) {
                if (setting.tracksExternalChanges) this.observe(target, setting, listener, signal);
            }
        }

        signal.addEventListener(
            "abort",
            () => {
                this.cancelPending();
            },
            { once: true }
        );
    }

    /**
     * 取消尚未提交的外部变化，Reset 时避免旧值延迟写回。
     */
    public cancelPending(): void {
        for (const timer of this.timers) window.clearTimeout(timer);
        this.timers.clear();
    }

    /**
     * 将单项 inline 变化合并为一次延迟提交，不把面板预览重复保存为外部变化。
     */
    private observe(
        target: SettingTarget,
        setting: Setting,
        listener: ExternalSettingListener,
        signal: AbortSignal
    ): void {
        let observedValue = setting.readExternalValue(target);
        let timer: number | undefined;

        /**
         * 同步清理局部句柄与统一任务集合，使 Reset 和页面退出共用同一清理路径。
         */
        const clearTimer = (): void => {
            if (timer === undefined) return;
            window.clearTimeout(timer);
            this.timers.delete(timer);
            timer = undefined;
        };

        // 先淘汰旧任务；移除 inline 值只取消等待，不自动产生 Reset。
        const observer = new MutationObserver(() => {
            if (signal.aborted) return;
            const value = setting.readExternalValue(target);
            if (value === observedValue) return;
            observedValue = value;
            clearTimer();
            if (value === undefined) return;

            // 等待期间可能出现新值或控件预览，提交前重新核对当前状态。
            timer = window.setTimeout(() => {
                const currentTimer = timer;
                timer = undefined;
                if (currentTimer !== undefined) this.timers.delete(currentTimer);

                if (signal.aborted || setting.readExternalValue(target) !== value) return;
                if (listener.isPreviewing(target, setting) || listener.getValue(target, setting) === value) return;

                EventUtil.run(() => {
                    listener.commitExternalChange(new SettingInteraction(target, setting, value));
                });
            }, 300);
            this.timers.add(timer);
        });

        // 仅监听当前 UI 的 style；生命周期结束后不再保留观察器或定时任务。
        observer.observe(target.ui.root, { attributes: true, attributeFilter: ["style"] });

        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                clearTimer();
            },
            { once: true }
        );
    }
}
