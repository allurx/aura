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

import type SettingControl from "../control/setting-control";
import type SettingControlListener from "../control/setting-control-listener";
import type PageAppearance from "../model/page-appearance";
import type { SettingScope } from "../model/setting-scope";
import type SettingTarget from "../model/setting-target";

/**
 * 一个强类型 Appearance 定义。
 *
 * 子类通过多态描述值域、快照读写、DOM 投影及对应控件；Controller 无需判断具体设置类型。
 *
 * @author allurx
 */
export default abstract class Setting {
    public readonly tracksExternalChanges: boolean = false;

    protected constructor(
        public readonly key: string,
        public readonly title: string,
        public readonly scope: SettingScope,
        public readonly displayOrder: number
    ) {}

    /** @returns `value` 是否属于当前设置的合法值域。 */
    public abstract accepts(value: unknown): value is string;

    /** @returns 当前目标在已提交快照中的显式值。 */
    public abstract read(appearance: PageAppearance, target: SettingTarget): string | undefined;

    /** @returns 写入指定值后的新快照。 */
    public abstract update(appearance: PageAppearance, target: SettingTarget, value: string): PageAppearance;

    /** 将显式值投影到运行时；`undefined` 表示恢复默认表现。 */
    public abstract apply(target: SettingTarget, value: string | undefined): void;

    /** @returns 控件与显示文本应呈现的有效值。 */
    public abstract resolveValue(target: SettingTarget, value: string | undefined): string;

    /** @returns 与当前定义匹配的设置控件。 */
    public abstract createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl;

    /**
     * 读取 UI 在设置面板之外产生的 inline preferred value。
     *
     * 只有 `tracksExternalChanges` 为 `true` 的设置会被调用，并应覆盖此方法。
     *
     * @returns 外部来源当前的显式值；来源当前没有显式值时返回 `undefined`
     */
    public readExternalValue(target: SettingTarget): string | undefined {
        void target;
        return undefined;
    }
}
