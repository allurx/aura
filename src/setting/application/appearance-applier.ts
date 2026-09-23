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
import type PageAppearance from "../model/page-appearance";
import type SettingConfiguration from "../model/setting-configuration";
import type SettingInteraction from "../model/setting-interaction";
import type SettingTarget from "../model/setting-target";

/**
 * 将 Appearance 快照或单次交互投影到 DOM。
 *
 * @author allurx
 */
export default class AppearanceApplier {
    public constructor(private readonly configuration: SettingConfiguration) {}

    /** 应用完整页面快照，并同步文档的页面标识。 */
    public apply(appearance: PageAppearance): void {
        document.documentElement.dataset["page"] = this.configuration.pageName;
        for (const target of this.configuration.targets) {
            for (const setting of target.settings) this.restore(appearance, target, setting);
        }
    }

    /** 应用一次预览或已提交交互。 */
    public applyInteraction(interaction: SettingInteraction): void {
        interaction.setting.apply(interaction.target, interaction.value);
    }

    /** 将单个设置恢复为快照中的已提交值。 */
    public restore(appearance: PageAppearance, target: SettingTarget, setting: Setting): void {
        setting.apply(target, setting.read(appearance, target));
    }
}
