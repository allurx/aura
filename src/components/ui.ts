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

import type { UiId } from "./ui-id";
import { assertExists, assertNonEmptyString } from "@/utils/assert-util";

/**
 * 界面基类
 * @author allurx
 */
export default abstract class Ui {
    public readonly root: HTMLElement;
    public readonly id: UiId;
    public readonly displayName: string;
    public readonly children: Ui[] = [];

    /**
     * 接管已有节点或挂载可信模板，并以非空 DOM id 标识设置目标。
     */
    public constructor({
        root,
        displayName,
    }: {
        root: HTMLElement | { container: HTMLElement; template: string };
        displayName: string;
    }) {
        this.root = root instanceof HTMLElement ? root : this.renderTemplate(root);
        this.id = assertNonEmptyString(
            this.root.id,
            `${this.constructor.name} Ui must have a non-empty id attribute`
        ) as UiId;
        this.displayName = displayName;
    }

    /**
     * 是否有子组件
     * @return 是否有子组件
     */
    public hasChildren(): boolean {
        return this.children.length > 0;
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
