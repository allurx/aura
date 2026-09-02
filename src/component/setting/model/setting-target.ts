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

import Ui from "@/component/ui";
import Setting from "@/component/setting/definition/setting";

/**
 * 一个 UI 及其明确开放的 Appearance 能力。
 *
 * @author allurx
 */
export default class SettingTarget {
    public readonly settings: readonly Setting[];

    public constructor(
        public readonly ui: Ui,
        settings: readonly Setting[]
    ) {
        this.settings = Object.freeze([...settings]);
    }

    /**
     * @param key - 设置键
     * @returns 当前目标支持的设置；不存在时返回 `undefined`
     */
    public findSetting(key: string): Setting | undefined {
        return this.settings.find((setting) => setting.key === key);
    }

    /**
     * @param setting - 设置定义
     * @returns 当前目标是否支持同一设置定义实例
     */
    public supports(setting: Setting): boolean {
        return this.settings.includes(setting);
    }
}
