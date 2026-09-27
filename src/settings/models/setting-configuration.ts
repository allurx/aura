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
import ThemeSetting from "../definitions/theme-setting";
import type { PageName } from "@/constants/page-name";
import { Theme } from "./theme";

/**
 * 单个页面的设置清单，供面板与持久化读取共同使用。
 *
 * @author allurx
 */
export default class SettingConfiguration {
    public readonly settings: readonly Setting[];
    public readonly themeSetting: ThemeSetting;
    public readonly defaultTheme = Theme.SUNNY;

    public constructor(
        public readonly pageName: PageName,
        settings: readonly Setting[]
    ) {
        const keys = new Set<string>();
        let themeSetting: ThemeSetting | undefined;

        for (const setting of settings) {
            if (keys.has(setting.key)) throw new Error(`Duplicate setting: ${setting.key}`);
            keys.add(setting.key);

            if (setting instanceof ThemeSetting) {
                if (themeSetting) throw new Error("A page can declare only one Theme setting");
                themeSetting = setting;
            }
        }

        if (!themeSetting) throw new Error("Setting configuration must declare a Theme setting");
        this.settings = Object.freeze([...settings]);
        this.themeSetting = themeSetting;
    }
}
