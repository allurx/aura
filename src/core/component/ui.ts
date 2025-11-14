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

import StyleEngine from "./style-engine";
import StyleConfigurable from "./style-configurable";
import { assertExists } from "../util/assert-util";
import { SettingName } from "./constant/setting-name";
import { ConfigurableStyleProperty } from "./constant/configurable-style-property";

/**
 * 界面基类
 * @author allurx
 */
export default abstract class Ui implements StyleConfigurable {
    public readonly id: string;
    public readonly root: HTMLElement;
    public readonly settingName: SettingName;
    public readonly displayName: string;
    public readonly children: Ui[] = [];
    public readonly configurableStyleProperties: Set<ConfigurableStyleProperty>;

    public constructor({
        root,
        settingName,
        displayName,
        configurableStyleProperties = new Set<ConfigurableStyleProperty>([]),
    }: {
        root: HTMLElement | { container: HTMLElement; template: string };
        settingName: SettingName;
        displayName: string;
        configurableStyleProperties?: Set<ConfigurableStyleProperty>;
    }) {
        this.id = crypto.randomUUID();
        this.root = root instanceof HTMLElement ? root : this.renderTemplate(root);
        this.settingName = settingName;
        this.displayName = displayName;
        this.configurableStyleProperties = configurableStyleProperties;
    }

    /**
     * @see StyleConfigurable.applyStyle
     */
    public applyStyle(style: Partial<Record<ConfigurableStyleProperty, string>>) {
        Object.entries(style).forEach(([property, value]) => {
            StyleEngine.setProperty(this.root, property as ConfigurableStyleProperty, value);
        });
        return this;
    }

    /**
     * @see StyleConfigurable.resetStyle
     */
    public resetStyle() {
        this.configurableStyleProperties.forEach((property) => {
            StyleEngine.removeProperty(this.root, property);
        });
        return this;
    }

    /**
     * 是否有子组件
     * @return 是否有子组件
     */
    public hasChildren(): boolean {
        return this.children.length > 0;
    }

    /**
     * 渲染模板
     */
    public renderTemplate({ container, template }: { container: HTMLElement; template: string }): HTMLElement {
        const templateElement = document.createElement("template");
        templateElement.innerHTML = template.trim();
        const node = assertExists(templateElement.content.firstElementChild);
        return container.appendChild(node) as HTMLElement;
    }
}
