/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StyleProperty } from "./style-property";
import type { Theme } from "./theme";

/**
 * 单个页面已提交的不可变外观快照，只保存主题和常规设置。
 *
 */
export default class PageAppearance {
    private constructor(
        public readonly theme: Theme,
        private readonly styles: ReadonlyMap<StyleProperty, string>
    ) {}

    /**
     * @returns 没有常规设置覆盖的页面默认快照。
     */
    public static defaults(theme: Theme): PageAppearance {
        return new PageAppearance(theme, new Map());
    }

    /**
     * @returns 已提交的显式值；缺失时使用主题或 CSS 默认值。
     */
    public getStyle(property: StyleProperty): string | undefined {
        return this.styles.get(property);
    }

    /**
     * 更新页面主题，保留所有常规设置。
     */
    public withTheme(theme: Theme): PageAppearance {
        return theme === this.theme ? this : new PageAppearance(theme, this.styles);
    }

    /**
     * 更新单个常规设置，保留其他设置。
     */
    public withStyle(property: StyleProperty, value: string): PageAppearance {
        const styles = new Map(this.styles);
        styles.set(property, value);
        return new PageAppearance(this.theme, styles);
    }

    /**
     * 移除单项显式覆盖，恢复主题或 CSS 默认值。
     */
    public withoutStyle(property: StyleProperty): PageAppearance {
        if (!this.styles.has(property)) return this;
        const styles = new Map(this.styles);
        styles.delete(property);
        return new PageAppearance(this.theme, styles);
    }

    /**
     * @returns page-scoped localStorage 的白名单结构。
     */
    public toJSON(): Record<string, unknown> {
        return { theme: this.theme, general: Object.fromEntries(this.styles) };
    }
}
