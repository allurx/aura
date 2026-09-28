/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SPA页面生命周期。
 */
export default interface Page {
    /**
     * 将页面挂载到应用根节点。
     * @param appRoot - 应用根节点
     */
    mount(appRoot: HTMLElement): Promise<void>;

    /**
     * 释放页面持有的事件、观察器和DOM资源。
     */
    dispose(): void;
}
