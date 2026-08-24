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
import DomUtil from "@/util/dom-util";
import SettingState from "./setting-state";
import { assertExists } from "@/util/assert-util";

/**
 * Setting item base class
 * @author allurx
 */
export default abstract class SettingItem {
    public readonly id: string;
    public readonly element: HTMLElement;
    public readonly control: ValueCapableElement;
    public readonly display: HTMLSpanElement;
    public readonly settingState: SettingState;

    public constructor(id: string, settingState: SettingState) {
        this.id = id;
        this.settingState = settingState;
        this.element = DomUtil.createElementFromHTML(this.template());
        this.control = assertExists(this.element.querySelector<ValueCapableElement>(".control"));
        this.display = assertExists(this.element.querySelector<HTMLSpanElement>(".display"));
    }

    public abstract onInput(handler: (settingItem: Record<string, unknown>) => Promise<void>): this;
    public abstract setControlValue(ui: Ui, value: unknown): this;
    public abstract setDisplayValue(ui: Ui, value: unknown): this;
    public abstract apply(ui: Ui, setting: unknown): this;
    public abstract reset(ui: Ui): this;
    public abstract unit(): string;
    public abstract template(): string;
    public abstract displayOrder(): number;
    public abstract applyOrder(): number;

    public show(): this {
        this.element.style.display = "flex";
        return this;
    }

    public hide(): this {
        this.element.style.display = "none";
        return this;
    }
}

// Define ValueCapableElement types
type ValueCapableElement =
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | HTMLOptionElement
    | HTMLButtonElement
    | HTMLProgressElement
    | HTMLMeterElement
    | HTMLDataElement;
