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

import SettingItem from "@/component/setting/setting-item";
import StyleEngine from "@/component/setting/style-engine";
import EventUtil from "@/util/event-util";
import Ui from "@/component/ui";
import { StyleProperty } from "@/component/setting/style-property";
import { SettingChangeHandlers } from "@/component/setting/setting-change";

/**
 * Style setting item
 * @author allurx
 */
export default abstract class StyleSettingItem extends SettingItem {
    public readonly styleProperty: StyleProperty;

    protected constructor(styleProperty: StyleProperty) {
        super(styleProperty);
        this.styleProperty = styleProperty;
    }

    public override bindChange(handlers: SettingChangeHandlers, signal: AbortSignal): this {
        EventUtil.bind(this.control, "input", (_, control) => {
            const value = String(control.value) + this.unit();
            handlers.preview({ key: this.styleProperty, value });
        }, { signal });
        EventUtil.bind(this.control, "change", async (_, control) => {
            const value = String(control.value) + this.unit();
            await handlers.commit({ key: this.styleProperty, value });
        }, { signal });
        return this;
    }

    public override accepts(value: unknown): value is string {
        return typeof value === "string";
    }

    public reset(ui: Ui): this {
        StyleEngine.removeProperty(ui.root, this.styleProperty);
        return this;
    }

    public override apply(ui: Ui, setting: string): this {
        StyleEngine.setProperty(ui.root, this.styleProperty, setting);
        return this;
    }

    public override setControlValue(ui: Ui, value: string | undefined): this {
        this.control.value = (value ?? StyleEngine.getComputedStyle(ui.root).getPropertyValue(this.styleProperty)).replace(
            new RegExp(`${this.unit()}$`),
            ""
        );
        return this;
    }

    public override setDisplayValue(ui: Ui, value: string | undefined): this {
        this.display.textContent = value ?? StyleEngine.getComputedStyle(ui.root).getPropertyValue(this.styleProperty);
        return this;
    }

    public override displayOrder(): number {
        return 2;
    }

}
