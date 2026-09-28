/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Aura 支持的页面基础配色。
 *
 */
export enum Theme {
    SUNNY = "sunny",
    BREEZE = "breeze",
    MEADOW = "meadow",
    PEACH = "peach",
    BLOSSOM = "blossom",
    PAPER = "paper",
    STARRY = "starry",
    DUSK = "dusk",
    OCEAN = "ocean",
}

const THEMES = new Set<string>(Object.values(Theme));

/**
 * @param value - 需要校验的外部值
 * @returns `value` 是否为当前产品支持的 Theme
 */
export function isTheme(value: unknown): value is Theme {
    return typeof value === "string" && THEMES.has(value);
}
