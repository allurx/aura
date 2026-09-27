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
 * 面板外部变化与已提交状态之间的契约。
 *
 * @author allurx
 */
export default interface ExternalSettingListener {
    /**
     * @returns 已提交的显式值，用于排除重复保存。
     */
    getValue(setting: Setting): string | undefined;

    /**
     * @returns 该设置是否正在预览；预览值不得作为外部变化提交。
     */
    isPreviewing(setting: Setting): boolean;

    /**
     * 保存外部变化，并同步正在显示的设置控件。
     */
    commitExternalChange(setting: Setting, value: string): void;
}
