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

/**
 * 设置 UI 与当前页面已提交状态之间的契约。
 *
 * @author allurx
 */
export default interface SettingUiListener {
    /**
     * @returns 当前已提交的显式值，不包含尚未确认的预览。
     */
    getValue(setting: Setting): string | undefined;

    /**
     * 仅将临时值投影到界面，不修改已提交快照或存储。
     */
    preview(setting: Setting, value: string): void;

    /**
     * 从当前已提交快照恢复指定项，撤销它在界面上的临时预览。
     */
    restore(setting: Setting): void;

    /**
     * 保存经过值域校验的设置，失败时恢复已提交表现。
     */
    commit(setting: Setting, value: string): void;

    /**
     * 重置单项，保留页面中的其他设置。
     */
    resetSetting(setting: Setting): void;

    /**
     * 重置页面常规设置，保留主题。
     */
    resetGeneral(): void;

    /**
     * 重置当前页面的主题和常规设置，不影响其他页面。
     */
    reset(): void;
}
