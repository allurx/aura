/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StyleProperty } from "./style-property";
import type { Theme } from "./theme";

/**
 * 单个页面的不可变外观快照，只保存主题和常规设置；应用与持久化由控制器负责。
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
     * @returns 快照中的显式值；未设置时返回 undefined，由设置定义解析默认表现。
     */
    public getStyle(property: StyleProperty): string | undefined {
        return this.styles.get(property);
    }

    /**
     * 返回指定主题的快照，保留所有常规设置。
     */
    public withTheme(theme: Theme): PageAppearance {
        return theme === this.theme ? this : new PageAppearance(theme, this.styles);
    }

    /**
     * 返回更新单个常规设置后的快照，保留其他设置。
     */
    public withStyle(property: StyleProperty, value: string): PageAppearance {
        const styles = new Map(this.styles);
        styles.set(property, value);
        return new PageAppearance(this.theme, styles);
    }

    /**
     * 返回移除单项显式值后的快照，不直接修改页面样式。
     */
    public withoutStyle(property: StyleProperty): PageAppearance {
        if (!this.styles.has(property)) return this;
        const styles = new Map(this.styles);
        styles.delete(property);
        return new PageAppearance(this.theme, styles);
    }

    /**
     * @returns 页面外观的存储结构，只包含主题和显式常规设置。
     */
    public toJSON(): Record<string, unknown> {
        return { theme: this.theme, general: Object.fromEntries(this.styles) };
    }
}
