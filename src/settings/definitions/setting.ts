/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type PageAppearance from "../models/page-appearance";
import type { Theme } from "../models/theme";

/**
 * 页面外观项的值域、快照更新与 DOM 应用契约。
 *
 */
export default abstract class Setting {
    protected constructor(
        public readonly key: string,
        public readonly title: string
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
}
