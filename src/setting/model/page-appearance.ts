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

import type { UiId } from "@/component/ui-id";
import type { StyleProperty } from "./style-property";
import type { Theme } from "./theme";

/**
 * 单个页面已经提交的不可变 Appearance 快照。
 *
 * Theme 是页面基础层；UI 样式仅保存用户显式设置的稀疏覆盖值。
 *
 * @author allurx
 */
export default class PageAppearance {
    private constructor(
        public readonly theme: Theme,
        private readonly styles: ReadonlyMap<UiId, ReadonlyMap<StyleProperty, string>>
    ) {}

    /**
     * @param theme - 当前页面的默认 Theme
     * @returns 不包含 UI 显式覆盖的默认快照
     */
    public static defaults(theme: Theme): PageAppearance {
        return new PageAppearance(theme, new Map());
    }

    /**
     * @param uiId - UI 标识
     * @param property - CSS 属性
     * @returns 已提交的显式覆盖值；缺失时返回 `undefined`
     */
    public getStyle(uiId: UiId, property: StyleProperty): string | undefined {
        return this.styles.get(uiId)?.get(property);
    }

    /**
     * @param theme - 新的页面基础 Theme
     * @returns 包含新 Theme 且保留全部 UI 显式覆盖的新快照
     */
    public withTheme(theme: Theme): PageAppearance {
        return theme === this.theme ? this : new PageAppearance(theme, this.styles);
    }

    /**
     * @param uiId - UI 标识
     * @param property - CSS 属性
     * @param value - 新的显式值
     * @returns 更新单个 UI 属性后的新快照
     */
    public withStyle(uiId: UiId, property: StyleProperty, value: string): PageAppearance {
        const styles = new Map(this.styles);
        const uiStyles = new Map(styles.get(uiId));
        uiStyles.set(property, value);
        styles.set(uiId, uiStyles);
        return new PageAppearance(this.theme, styles);
    }

    /**
     * @returns 可安全序列化到 page-scoped localStorage 的稳定白名单结构
     */
    public toJSON(): Record<string, unknown> {
        const ui: Record<string, Record<string, string>> = {};
        for (const [uiId, styles] of this.styles) {
            ui[uiId] = Object.fromEntries(styles);
        }
        return { theme: this.theme, ui };
    }
}
