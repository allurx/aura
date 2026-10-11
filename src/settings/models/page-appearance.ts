/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Theme } from "./theme";
import type { PanelBounds } from "@/components/dialog/panel-frame";

/**
 * 独立保存布局的浮层标识，不随显示名称变化。
 */
export type PanelName = "settings" | "toc";

/**
 * 桌面阅读工具栏的显示偏好；尺寸由工具内容决定，只保存用户选择的位置与收起状态。
 */
export interface ReaderToolsAppearance {
    readonly collapsed: boolean;
    readonly position?: { readonly left: number; readonly top: number };
}

/**
 * 单个页面的不可变外观快照，保存主题、常规设置与浮层布局；应用与持久化由控制器负责。
 */
export default class PageAppearance {
    private constructor(
        public readonly theme: Theme,
        private readonly general: ReadonlyMap<string, string>,
        private readonly panels: ReadonlyMap<PanelName, PanelBounds> = new Map(),
        private readonly toolbar?: ReaderToolsAppearance
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
        return theme === this.theme ? this : new PageAppearance(theme, this.general, this.panels, this.toolbar);
    }

    /**
     * 返回更新单个常规设置后的快照，保留其他设置。
     */
    public withValue(key: string, value: string): PageAppearance {
        const general = new Map(this.general);
        general.set(key, value);
        return new PageAppearance(this.theme, general, this.panels, this.toolbar);
    }

    /**
     * 返回移除单项显式值后的快照，不直接修改页面样式。
     */
    public withoutValue(key: string): PageAppearance {
        if (!this.general.has(key)) return this;
        const general = new Map(this.general);
        general.delete(key);
        return new PageAppearance(this.theme, general, this.panels, this.toolbar);
    }

    /**
     * 面板保存首选几何，当前视口的夹取结果不改写偏好。
     */
    public getPanel(name: PanelName): PanelBounds | undefined {
        return this.panels.get(name);
    }

    /**
     * 更新或还原单个浮层，保留其余页面外观。
     */
    public withPanel(name: PanelName, bounds: PanelBounds | undefined): PageAppearance {
        const panels = new Map(this.panels);
        if (bounds) panels.set(name, bounds);
        else panels.delete(name);
        return new PageAppearance(this.theme, this.general, panels, this.toolbar);
    }

    /**
     * 常规外观重置包括所有浮层布局，主题保持不变。
     */
    public withoutLayout(): PageAppearance {
        return this.panels.size === 0 && this.toolbar === undefined
            ? this
            : new PageAppearance(this.theme, this.general);
    }

    /**
     * 当前页面是否保存了显式浮层布局。
     */
    public hasCustomLayout(): boolean {
        return this.panels.size > 0 || this.toolbar !== undefined;
    }

    /**
     * 未设置时由阅读工具栏使用默认展开状态和侧边位置。
     */
    public getToolbar(): ReaderToolsAppearance | undefined {
        return this.toolbar;
    }

    /**
     * 默认展开且未移动时无需保存覆盖；工具栏变更保留主题、正文外观和其他浮层。
     */
    public withToolbar(value: ReaderToolsAppearance): PageAppearance {
        const toolbar = value.collapsed || value.position ? value : undefined;
        return new PageAppearance(this.theme, this.general, this.panels, toolbar);
    }

    /**
     * @returns 页面外观的存储结构，包含主题和显式常规设置、浮层布局。
     */
    public toJSON(): Record<string, unknown> {
        return {
            theme: this.theme,
            general: Object.fromEntries(this.general),
            panels: Object.fromEntries(this.panels),
            toolbar: this.toolbar,
        };
    }
}
