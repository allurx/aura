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

import type Ui from "@/components/ui";
import type Setting from "../definitions/setting";
import type { PageName } from "@/constants/page-name";
import { assertExists } from "@/utils/assert-util";

/**
 * 一个 UI 及其明确开放的 Appearance 能力。
 *
 * @author allurx
 */
export default class SettingTarget {
    public readonly settings: readonly Setting[];
    private configuredPageName: PageName | undefined;

    public constructor(
        public readonly ui: Ui,
        settings: readonly Setting[]
    ) {
        this.settings = Object.freeze([...settings]);
    }

    /**
     * 页面上下文由能力清单绑定，同名区域仍按所属页面选择值域。
     */
    public get pageName(): PageName {
        return assertExists(this.configuredPageName, `Setting target ${this.ui.id} is not configured`);
    }

    /**
     * 将目标固定到当前页面，防止同一目标实例在不同页面间复用。
     */
    public configureForPage(pageName: PageName): void {
        if (this.configuredPageName !== undefined && this.configuredPageName !== pageName) {
            throw new Error(`Setting target ${this.ui.id} already belongs to ${this.configuredPageName}`);
        }
        this.configuredPageName = pageName;
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
