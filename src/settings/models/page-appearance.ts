/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from "./theme";

/**
 * 单个页面的不可变外观快照，只保存主题和常规设置；应用与持久化由控制器负责。
 */
export default class PageAppearance {
    private constructor(
        public readonly theme: Theme,
        private readonly general: ReadonlyMap<string, string>
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
    public getValue(key: string): string | undefined {
        return this.general.get(key);
    }

    /**
     * 返回指定主题的快照，保留所有常规设置。
     */
    public withTheme(theme: Theme): PageAppearance {
        return theme === this.theme ? this : new PageAppearance(theme, this.general);
    }

    /**
     * 返回更新单个常规设置后的快照，保留其他设置。
     */
    public withValue(key: string, value: string): PageAppearance {
        const general = new Map(this.general);
        general.set(key, value);
        return new PageAppearance(this.theme, general);
    }

    /**
     * 返回移除单项显式值后的快照，不直接修改页面样式。
     */
    public withoutValue(key: string): PageAppearance {
        if (!this.general.has(key)) return this;
        const general = new Map(this.general);
        general.delete(key);
        return new PageAppearance(this.theme, general);
    }

    /**
     * @returns 页面外观的存储结构，只包含主题和显式常规设置。
     */
    public toJSON(): Record<string, unknown> {
        return { theme: this.theme, general: Object.fromEntries(this.general) };
    }
}
