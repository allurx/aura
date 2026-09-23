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
import type SettingInteraction from "../models/setting-interaction";
import type SettingTarget from "../models/setting-target";

/**
 * 面板外部 Appearance 变化与已提交状态所有者之间的契约。
 *
 * @author allurx
 */
export default interface ExternalSettingListener {
    getValue(target: SettingTarget, setting: Setting): string | undefined;
    isPreviewing(target: SettingTarget, setting: Setting): boolean;
    commitExternalChange(interaction: SettingInteraction): void;
}
