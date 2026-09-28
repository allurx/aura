/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Page from "./page";
import { createElementFromHtml } from "@/utils/dom-util";
import { bindVisualViewport } from "./visual-viewport";
import { bindFocusNavigation } from "./focus-navigation";

/**
 * 页面基类，统一管理单个页面实例的挂载和销毁生命周期。
 */
export default abstract class BasePage implements Page {
    protected readonly lifecycleController = new AbortController();
    private pageElement: HTMLElement | null = null;

    protected constructor(private readonly template: string) {}

    /**
     * 挂载并初始化单个页面实例；已销毁实例不再挂载，重复挂载视为调用错误。
     */
    public async mount(appRoot: HTMLElement): Promise<void> {
        if (this.lifecycleController.signal.aborted) return;
        if (this.pageElement) throw new Error(`${this.constructor.name} is already mounted`);

        this.pageElement = appRoot.appendChild(createElementFromHtml(this.template));
        bindFocusNavigation(this.lifecycleController.signal);
        bindVisualViewport(this.lifecycleController.signal);
        await this.init(this.pageElement, appRoot);
    }

    /**
     * 先结束异步与事件生命周期，再移除页面节点；销毁后的实例不可复用。
     */
    public dispose(): void {
        this.lifecycleController.abort();
        this.pageElement?.remove();
        this.pageElement = null;
    }

    /**
     * 初始化页面特有的状态、内容和事件。
     * @param pageRoot - 页面根节点
     * @param appRoot - SPA 应用挂载节点
     */
    protected abstract init(pageRoot: HTMLElement, appRoot: HTMLElement): Promise<void>;
}
