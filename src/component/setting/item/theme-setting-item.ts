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
import { assertExists } from "@/util/assert-util";
import {
    isTheme,
    SettingChangeHandlers,
    Theme,
    THEME_OPTIONS,
    THEME_SETTING_KEY,
} from "@/component/setting/setting-change";

/**
 * Theme setting item
 * @author allurx
 */
export default class ThemeSettingItem extends SettingItem {
    public static readonly ID = THEME_SETTING_KEY;

    public constructor() {
        super(ThemeSettingItem.ID);
    }

    public override bindChange(handlers: SettingChangeHandlers, signal: AbortSignal): this {
        EventUtil.bind(this.control as HTMLSelectElement, "change", async (_, control) => {
            const theme = assertExists(THEME_OPTIONS.find((item) => item.value === control.value));
            const change = { key: ThemeSettingItem.ID, value: theme.value } as const;
            await handlers.commit(change);
        }, { signal });
        return this;
    }

    public override accepts(value: unknown): value is Theme {
        return isTheme(value);
    }

    public override reset(ui: Ui): this {
        delete ui.root.dataset["theme"];
        return this;
    }

    public override apply(ui: Ui, setting: string): this {
        ui.root.dataset["theme"] = this.requireTheme(setting);
        return this;
    }

    public override setControlValue(ui: Ui, value: string | undefined): this {
        this.control.value = value ?? this.defaultTheme(ui);
        return this;
    }

    public override setDisplayValue(ui: Ui, value: string | undefined): this {
        this.display.textContent = value ?? this.defaultTheme(ui);
        return this;
    }

    public override unit(): string {
        return "";
    }

    public override displayOrder(): number {
        return 1;
    }

    public override template(): string {
        return `
            <div class="item">
                <span class="title">主题</span>
                <select class="control">
                ${THEME_OPTIONS.map((theme) => `<option value="${theme.value}">${theme.name}</option>`).join("")}</select>
                <span class="display"></span>
            </div>
        `;
    }

    private defaultTheme(ui: Ui): Theme {
        return this.requireTheme(ui.root.dataset["defaultTheme"]);
    }

    private requireTheme(value: unknown): Theme {
        if (!isTheme(value)) throw new Error(`Invalid theme: ${String(value)}`);
        return value;
    }
}
