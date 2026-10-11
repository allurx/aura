/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import PageAppearance from "../models/page-appearance";
import type SettingConfiguration from "../models/setting-configuration";
import { PageName } from "@/constants/page-name";
import type { PanelName } from "../models/page-appearance";

/**
 * 页面外观的同步 localStorage 仓库。
 *
 * 只读取当前设置清单允许的值，不转换旧结构或回写读取结果。
 */
export default class AppearanceRepository {
    private readonly storageKey: string;

    public constructor(private readonly configuration: SettingConfiguration) {
        this.storageKey = `aura.${configuration.pageName}.appearance`;
    }

    /**
     * 读取失败时使用本页默认值；可解析快照逐项保留合法字段。
     */
    public load(): PageAppearance {
        const defaults = PageAppearance.defaults(this.configuration.defaultTheme);

        let serializedAppearance: string | null;
        try {
            serializedAppearance = localStorage.getItem(this.storageKey);
        } catch {
            return defaults;
        }
        if (serializedAppearance === null) return defaults;

        let parsedAppearance: unknown;
        try {
            parsedAppearance = JSON.parse(serializedAppearance);
        } catch {
            return defaults;
        }
        return this.decode(parsedAppearance);
    }

    /**
     * @throws {DOMException} localStorage 不可写时抛出。
     */
    public save(appearance: PageAppearance): void {
        localStorage.setItem(this.storageKey, JSON.stringify(appearance));
    }

    /**
     * 删除当前页面外观，不影响其他页面。
     *
     * @throws {DOMException} localStorage 不可写时抛出。
     */
    public reset(): void {
        localStorage.removeItem(this.storageKey);
    }

    /**
     * 按当前页面的设置清单逐项校验；未知字段和非法值不进入快照。
     */
    private decode(value: unknown): PageAppearance {
        let appearance = PageAppearance.defaults(this.configuration.defaultTheme);
        if (!this.isRecord(value)) return appearance;

        const theme = value["theme"];
        if (this.configuration.theme.accepts(theme)) {
            appearance = this.configuration.theme.update(appearance, theme);
        }

        const general = value["general"];
        if (this.isRecord(general)) {
            for (const setting of this.configuration.general) {
                const settingValue = general[setting.key];
                if (setting.accepts(settingValue)) appearance = setting.update(appearance, settingValue);
            }
        }
        const panels = value["panels"];
        if (this.isRecord(panels)) {
            const names: readonly PanelName[] =
                this.configuration.pageName === PageName.READER ? ["settings", "toc"] : ["settings"];
            for (const name of names) {
                const bounds = panels[name];
                if (!this.isRecord(bounds)) continue;
                const { left, top, width, height } = bounds;
                if (
                    typeof left === "number" &&
                    Number.isFinite(left) &&
                    typeof top === "number" &&
                    Number.isFinite(top) &&
                    typeof width === "number" &&
                    Number.isFinite(width) &&
                    width > 0 &&
                    typeof height === "number" &&
                    Number.isFinite(height) &&
                    height > 0
                )
                    appearance = appearance.withPanel(name, { left, top, width, height });
            }
        }
        const toolbar = value["toolbar"];
        if (
            this.configuration.pageName === PageName.READER &&
            this.isRecord(toolbar) &&
            typeof toolbar["collapsed"] === "boolean"
        ) {
            const position = toolbar["position"];
            const validPosition =
                this.isRecord(position) &&
                typeof position["left"] === "number" &&
                Number.isFinite(position["left"]) &&
                typeof position["top"] === "number" &&
                Number.isFinite(position["top"])
                    ? { left: position["left"], top: position["top"] }
                    : undefined;
            appearance = appearance.withToolbar({
                collapsed: toolbar["collapsed"],
                ...(validPosition ? { position: validPosition } : {}),
            });
        }
        return appearance;
    }

    /**
     * 排除数组和 null，供外部 JSON 字段收窄使用。
     */
    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
}
