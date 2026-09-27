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

import { assertExists } from "@/utils/assert-util";

/**
 * 接管已有节点或可信模板的通用界面组件。
 * @author allurx
 */
export default class Ui {
    public readonly root: HTMLElement;

    /**
     * 接管已有节点或挂载应用提供的可信模板。
     */
    public constructor({ root }: { root: HTMLElement | { container: HTMLElement; template: string } }) {
        this.root = root instanceof HTMLElement ? root : this.renderTemplate(root);
    }

    /**
     * 挂载应用提供的可信模板；外部字符串不得作为模板传入。
     */
    public renderTemplate({ container, template }: { container: HTMLElement; template: string }): HTMLElement {
        const templateElement = document.createElement("template");
        templateElement.innerHTML = template.trim();
        return container.appendChild(assertExists(templateElement.content.firstElementChild)) as HTMLElement;
    }
}
