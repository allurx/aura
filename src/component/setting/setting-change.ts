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

import Ui from "@/component/ui";
import { StyleProperty } from "./style-property";

export const THEME_SETTING_KEY = "theme" as const;
export const THEME_OPTIONS = [
    { name: "浅色", value: "light" },
    { name: "昏暗", value: "dim" },
    { name: "深色", value: "dark" },
    { name: "黄色", value: "yellow" },
    { name: "蓝色", value: "blue" },
    { name: "灰色", value: "gray" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["value"];
export type SettingKey = StyleProperty | typeof THEME_SETTING_KEY;
export type SettingValueMap = Record<StyleProperty, string> & Record<typeof THEME_SETTING_KEY, Theme>;

export type SettingItemChange =
    | {
          readonly key: StyleProperty;
          readonly value: string;
      }
    | {
          readonly key: typeof THEME_SETTING_KEY;
          readonly value: Theme;
      };

export type UiSettingChange = SettingItemChange & {
    readonly ui: Ui;
};

export interface SettingChangeHandlers {
    preview(change: SettingItemChange): void;
    commit(change: SettingItemChange): Promise<void>;
}

export function isTheme(value: unknown): value is Theme {
    return typeof value === "string" && THEME_OPTIONS.some((theme) => theme.value === value);
}
