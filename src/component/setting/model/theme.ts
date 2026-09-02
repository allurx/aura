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

/**
 * Aura 支持的页面基础配色。
 *
 * @author allurx
 */
export enum Theme {
    LIGHT = "light",
    DIM = "dim",
    DARK = "dark",
    YELLOW = "yellow",
    BLUE = "blue",
    GRAY = "gray",
}

const THEMES = new Set<string>(Object.values(Theme));

/**
 * @param value - 需要校验的外部值
 * @returns `value` 是否为当前产品支持的 Theme
 */
export function isTheme(value: unknown): value is Theme {
    return typeof value === "string" && THEMES.has(value);
}
