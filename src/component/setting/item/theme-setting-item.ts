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
import EventUtil from "@/util/event-util";
import SettingItem from "@/component/setting/setting-item";
import StyleEngine from "@/component/setting/style-engine";
import SettingState from "@/component/setting/setting-state";
import { UiId } from "@/component/ui-id";
import { StyleProperty } from "@/component/setting/style-property";
import { assertExists } from "@/util/assert-util";

/**
 * Theme setting item
 * @author allurx
 */
export default class ThemeSettingItem extends SettingItem {
    public constructor(settingState: SettingState) {
        super("theme", settingState);
    }

    public override onInput(handler: (settingItem: Record<string, unknown>) => Promise<void>): this {
        EventUtil.bind(this.control as HTMLSelectElement, "change", async (_, control) => {
            const theme = assertExists(ThemeSettingItem.THEMES.find((item) => item.value === control.value));
            const ui = this.settingState.ui;
            this.setDisplayValue(ui, theme.value);
            this.apply(ui, theme.value);
            await handler({ [this.id]: theme.value });
        });
        return this;
    }

    public override reset(ui: Ui): this {
        console.log(`${ui.id} reset theme setting`);
        Object.entries(
            assertExists(ThemeSettingItem.THEMES.find((item) => item.value === this.control.value)).uiStyle
        ).forEach(([uiId, style]) => {
            const element = document.getElementById(uiId);
            if (element) {
                Object.entries(style).forEach(([styleProperty]) => {
                    StyleEngine.removeProperty(element, styleProperty as StyleProperty);
                });
            }
        });
        return this;
    }

    public override apply(ui: Ui, setting: string): this {
        console.log(`${ui.id} apply theme setting: ${setting}`);
        Object.entries(assertExists(ThemeSettingItem.THEMES.find((item) => item.value === setting)).uiStyle).forEach(
            ([uiId, style]) => {
                const element = document.getElementById(uiId);
                if (element) {
                    Object.entries(style).forEach(([styleProperty, value]) => {
                        StyleEngine.setProperty(element, styleProperty as StyleProperty, value);
                    });
                }
            }
        );
        return this;
    }

    public override setControlValue(_: Ui, value: string | undefined): this {
        this.control.value = value ?? "yellow";
        return this;
    }

    public override setDisplayValue(_: Ui, value: string | undefined): this {
        this.display.textContent = value ?? "yellow";
        return this;
    }

    public override unit(): string {
        return "";
    }

    public override displayOrder(): number {
        return 1;
    }

    public override applyOrder(): number {
        return 1;
    }

    public override template(): string {
        return `
            <div class="item">
                <span class="title">主题</span>
                <select class="control">
                ${ThemeSettingItem.THEMES.map((theme) => `<option value="${theme.value}">${theme.name}</option>`).join(
                    ""
                )}</select>
                <span class="display"></span>
            </div>
        `;
    }

    private static readonly THEMES = [
        {
            name: "浅色",
            value: "light",
            uiStyle: {
                [UiId.DOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#ffffff",
                },

                [UiId.READER]: {
                    [StyleProperty.COLOR]: "#000000",
                    [StyleProperty.BACKGROUND_COLOR]: "#ffffff",
                },
                [UiId.SETTING]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#ffffff",
                },
                [UiId.TOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#ffffff",
                },
            },
        },
        {
            name: "昏暗",
            value: "dim",
            uiStyle: {
                [UiId.DOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#111a2e",
                },
                [UiId.READER]: {
                    [StyleProperty.COLOR]: "#e3e3e3",
                    [StyleProperty.BACKGROUND_COLOR]: "#111a2e",
                },
                [UiId.SETTING]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#111a2e",
                },
                [UiId.TOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#111a2e",
                },
            },
        },
        {
            name: "深色",
            value: "dark",
            uiStyle: {
                [UiId.DOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#202124",
                },
                [UiId.READER]: {
                    [StyleProperty.COLOR]: "#e3e3e3",
                    [StyleProperty.BACKGROUND_COLOR]: "#202124",
                },
                [UiId.SETTING]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#202124",
                },
                [UiId.TOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#202124",
                },
            },
        },
        {
            name: "黄色",
            value: "yellow",
            uiStyle: {
                [UiId.DOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#be966e",
                },
                [UiId.READER]: {
                    [StyleProperty.COLOR]: "#000000",
                    [StyleProperty.BACKGROUND_COLOR]: "#f2e8c8",
                },
                [UiId.SETTING]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#f2e8c8",
                },
                [UiId.TOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#f2e8c8",
                },
            },
        },
        {
            name: "蓝色",
            value: "blue",
            uiStyle: {
                [UiId.DOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#d2e3fc",
                },

                [UiId.READER]: {
                    [StyleProperty.COLOR]: "#000000",
                    [StyleProperty.BACKGROUND_COLOR]: "#d2e3fc",
                },
                [UiId.SETTING]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#d2e3fc",
                },
                [UiId.TOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#d2e3fc",
                },
            },
        },
        {
            name: "灰色",
            value: "gray",
            uiStyle: {
                [UiId.DOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#3c3c3c",
                },
                [UiId.READER]: {
                    [StyleProperty.COLOR]: "#e3e3e3",
                    [StyleProperty.BACKGROUND_COLOR]: "#3c3c3c",
                },
                [UiId.SETTING]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#3c3c3c",
                },
                [UiId.TOC]: {
                    [StyleProperty.BACKGROUND_COLOR]: "#3c3c3c",
                },
            },
        },
    ];
}
