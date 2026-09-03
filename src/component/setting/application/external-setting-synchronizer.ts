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

import Setting from "@/component/setting/definition/setting";
import SettingConfiguration from "@/component/setting/model/setting-configuration";
import SettingInteraction from "@/component/setting/model/setting-interaction";
import SettingTarget from "@/component/setting/model/setting-target";
import EventUtil from "@/util/event-util";
import ExternalSettingListener from "./external-setting-listener";

/**
 * 将 resize 等面板外部产生的 inline Appearance 变化同步到已提交快照。
 *
 * 只跟踪具体的 inline preferred value；外部移除该值不等同于设置 Reset，不会提交。
 *
 * @author allurx
 */
export default class ExternalSettingSynchronizer {
    private readonly timers = new Set<number>();

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

    /** 取消尚未提交的外部变化，Reset 时避免旧值延迟写回。 */
    public cancelPending(): void {
        for (const timer of this.timers) window.clearTimeout(timer);
        this.timers.clear();
    }

    private observe(
        target: SettingTarget,
        setting: Setting,
        listener: ExternalSettingListener,
        signal: AbortSignal
    ): void {
        let observedValue = setting.readExternalValue(target);
        let timer: number | undefined;

        const clearTimer = (): void => {
            if (timer === undefined) return;
            window.clearTimeout(timer);
            this.timers.delete(timer);
            timer = undefined;
        };
        const observer = new MutationObserver(() => {
            if (signal.aborted) return;
            const value = setting.readExternalValue(target);
            if (value === observedValue) return;
            observedValue = value;
            clearTimer();
            if (value === undefined) return;

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
