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

import type SettingControl from "../controls/setting-control";
import type SettingControlListener from "../controls/setting-control-listener";
import type PageAppearance from "../models/page-appearance";
import type { Theme } from "../models/theme";

/**
 * 单个页面设置的值域、持久化、DOM 应用和控件定义。
 *
 * @author allurx
 */
export default abstract class Setting {
    public readonly tracksExternalChanges: boolean = false;

    protected constructor(
        public readonly key: string,
        public readonly title: string,
        public readonly displayOrder: number
    ) {}

    /**
     * @returns value 是否属于当前设置的合法值域。
     */
    public abstract accepts(value: unknown): value is string;

    /**
     * @returns 已提交快照中的显式值。
     */
    public abstract read(appearance: PageAppearance): string | undefined;

    /**
     * @returns 写入指定值后的新快照。
     */
    public abstract update(appearance: PageAppearance, value: string): PageAppearance;

    /**
     * 移除当前项的显式覆盖；主题恢复为 defaultTheme。
     */
    public abstract reset(appearance: PageAppearance, defaultTheme: Theme): PageAppearance;

    /**
     * 应用显式值；undefined 恢复主题与 CSS 默认表现。
     */
    public abstract apply(value: string | undefined): void;

    /**
     * @returns 控件应呈现的有效值。
     */
    public abstract resolveValue(value: string | undefined): string;

    /**
     * @returns 与当前定义匹配的设置控件。
     */
    public abstract createControl(listener: SettingControlListener, signal: AbortSignal): SettingControl;

    /**
     * 读取面板外部产生的首选值，仅声明 tracksExternalChanges 的设置需要实现。
     */
    public readExternalValue(): string | undefined {
        return undefined;
    }
}
