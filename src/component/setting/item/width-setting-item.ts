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

import StyleSettingItem from "./style-setting-item";
import { StyleProperty } from "@/component/setting/style-property";
import Ui from "@/component/ui";
import { assertExists } from "@/util/assert-util";
import EventUtil from "@/util/event-util";
import { SettingChangeHandlers } from "@/component/setting/setting-change";

/**
 * Width setting item
 * @author allurx
 */
export default class WidthSettingItem extends StyleSettingItem {
    private static readonly MIN_WIDTH = 800;

    private readonly range: HTMLInputElement;

    public constructor() {
        super(StyleProperty.WIDTH);
        this.range = assertExists(this.element.querySelector<HTMLInputElement>('input[type="range"]'));
    }

    public override bindChange(handlers: SettingChangeHandlers, signal: AbortSignal): this {
        super.bindChange(handlers, signal);
        EventUtil.bind(this.range, "pointerdown", () => {
            this.updateRange(this.range.value);
        }, { signal });
        EventUtil.bind(this.range, "focus", () => {
            this.updateRange(this.range.value);
        }, { signal });
        return this;
    }

    public override setControlValue(ui: Ui, value: string | undefined): this {
        const preferredWidth = this.resolvePreferredWidth(ui, value);
        this.updateRange(preferredWidth);
        this.range.value = preferredWidth.replace(new RegExp(`${this.unit()}$`), "");
        return this;
    }

    public override setDisplayValue(ui: Ui, value: string | undefined): this {
        this.display.textContent = this.resolvePreferredWidth(ui, value);
        return this;
    }

    public override unit(): string {
        return "px";
    }

    public override template(): string {
        return `
            <div class="item width-setting">
                <span class="title">宽度</span>
                <input class="control" type="range" step="1" min="${String(WidthSettingItem.MIN_WIDTH)}" max="${String(Math.max(WidthSettingItem.MIN_WIDTH, window.innerWidth))}" />
                <span class="display"></span>
            </div>
        `;
    }

    private updateRange(preferredWidth: string | undefined): void {
        const parsedPreferredWidth = Number.parseFloat(preferredWidth ?? "");
        this.range.max = String(
            Math.max(
                WidthSettingItem.MIN_WIDTH,
                window.innerWidth,
                Number.isFinite(parsedPreferredWidth) ? parsedPreferredWidth : 0
            )
        );
    }

    private resolvePreferredWidth(ui: Ui, value: string | undefined): string {
        return value ?? (ui.root.style.width || `${String(WidthSettingItem.MIN_WIDTH)}px`);
    }
}
