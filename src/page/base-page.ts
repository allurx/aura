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

import Page from "./page";
import DomUtil from "../util/dom-util";

/**
 * 页面基类，统一管理单个页面实例的挂载和销毁生命周期。
 * @author allurx
 */
export default abstract class BasePage implements Page {
    protected readonly lifecycleController = new AbortController();
    private pageElement: HTMLElement | null = null;

    protected constructor(private readonly template: string) {}

    public async mount(root: HTMLElement): Promise<void> {
        if (this.lifecycleController.signal.aborted) return;
        if (this.pageElement) throw new Error(`${this.constructor.name} is already mounted`);

        this.pageElement = root.appendChild(DomUtil.createElementFromHTML(this.template));
        await this.init(this.pageElement);
    }

    public dispose(): void {
        this.lifecycleController.abort();
        this.pageElement?.remove();
        this.pageElement = null;
    }

    /**
     * 初始化页面特有的状态、内容和事件。
     */
    protected abstract init(root: HTMLElement): Promise<void>;
}
