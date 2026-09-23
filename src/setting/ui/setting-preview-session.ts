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

import type Setting from "../definition/setting";
import type SettingTarget from "../model/setting-target";

/**
 * 将 input 预览与后续 change 提交绑定到同一个目标。
 *
 * @author allurx
 */
export default class SettingPreviewSession {
    private readonly targetBySetting = new Map<Setting, SettingTarget>();
    private readonly cancelledSettings = new Set<Setting>();

    public begin(setting: Setting, target: SettingTarget): void {
        this.cancelledSettings.delete(setting);
        this.targetBySetting.set(setting, target);
    }

    /** @returns 对应预览目标，并结束该设置的预览会话。 */
    public finish(setting: Setting): SettingTarget | undefined {
        const target = this.targetBySetting.get(setting);
        this.targetBySetting.delete(setting);
        return target;
    }

    /** @returns 当前提交是否来自已经取消、且尚未开始下一次 input 的预览。 */
    public isCancelled(setting: Setting): boolean {
        return this.cancelledSettings.has(setting);
    }

    public isPreviewing(target: SettingTarget, setting: Setting): boolean {
        return this.targetBySetting.get(setting) === target;
    }

    /** 取消全部预览，并让调用方恢复每个目标的已提交值。 */
    public cancel(restore: (target: SettingTarget, setting: Setting) => void): void {
        for (const [setting, target] of this.targetBySetting) {
            restore(target, setting);
            this.cancelledSettings.add(setting);
        }
        this.targetBySetting.clear();
    }

    /** 页面销毁时丢弃会话，不再向即将移除的目标写回 DOM。 */
    public discard(): void {
        this.targetBySetting.clear();
        this.cancelledSettings.clear();
    }
}
