/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type PageAppearance from "../models/page-appearance";
import type { Theme } from "../models/theme";

/**
 * 页面外观项的值域、快照更新与 DOM 应用契约，快照操作不直接修改页面或存储。
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
     * @returns 给定快照中的显式值，未设置时返回 undefined。
     */
    public abstract read(appearance: PageAppearance): string | undefined;

    /**
     * @returns 写入指定值后的快照，不修改传入的快照。
     */
    public abstract update(appearance: PageAppearance, value: string): PageAppearance;

    /**
     * 返回移除当前项显式覆盖后的快照；主题项恢复为 defaultTheme。
     */
    public abstract reset(appearance: PageAppearance, defaultTheme: Theme): PageAppearance;

    /**
     * 将显式值应用到页面；undefined 恢复当前设置定义的默认表现。
     */
    public abstract apply(value: string | undefined): void;

    /**
     * @returns 控件应呈现的有效值。
     */
    public abstract resolveValue(value: string | undefined): string;
}
