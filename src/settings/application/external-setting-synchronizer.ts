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
import StyleSetting from "../definitions/style-setting";
import type SettingConfiguration from "../models/setting-configuration";
import EventUtil from "@/utils/event-util";
import type ExternalSettingListener from "./external-setting-listener";

/**
 * 将原生 resize 等面板外部的首选值变化保存到页面设置。
 *
 * 只跟踪 inline 首选值；移除 inline 值不自动产生重置。
 *
 * @author allurx
 */
export default class ExternalSettingSynchronizer {
    private readonly timers = new Map<Setting, number>();

    /**
     * 只观察明确声明外部变化的样式设置，并随页面退出释放观察器。
     */
    public start(configuration: SettingConfiguration, listener: ExternalSettingListener, signal: AbortSignal): void {
        for (const setting of configuration.settings) {
            if (setting instanceof StyleSetting && setting.tracksExternalChanges) {
                this.observe(setting, listener, signal);
            }
        }
    }

    /**
     * 重置时取消相关待提交值，省略设置时取消全部等待任务。
     */
    public cancelPending(setting?: Setting): void {
        if (setting) {
            const timer = this.timers.get(setting);
            if (timer !== undefined) window.clearTimeout(timer);
            this.timers.delete(setting);
            return;
        }

        for (const timer of this.timers.values()) window.clearTimeout(timer);
        this.timers.clear();
    }

    /**
     * 合并连续 inline 变化，排除已保存值、面板预览和已失效的观察结果。
     */
    private observe(setting: StyleSetting, listener: ExternalSettingListener, signal: AbortSignal): void {
        let observedValue = setting.readExternalValue();

        const observer = new MutationObserver(() => {
            if (signal.aborted) return;
            const value = setting.readExternalValue();
            if (value === observedValue) return;
            observedValue = value;
            this.cancelPending(setting);
            if (value === undefined || !setting.accepts(value)) return;

            const timer = window.setTimeout(() => {
                this.timers.delete(setting);
                if (signal.aborted || setting.readExternalValue() !== value) return;
                if (listener.isPreviewing(setting) || listener.getValue(setting) === value) return;

                EventUtil.run(() => {
                    listener.commitExternalChange(setting, value);
                });
            }, 300);
            this.timers.set(setting, timer);
        });

        observer.observe(setting.element, { attributes: true, attributeFilter: ["style"] });
        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                this.cancelPending(setting);
            },
            { once: true }
        );
    }
}
