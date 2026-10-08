/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import template from "./reader.html?raw";
import BasePage from "@/pages/base-page";
import ReaderController from "./reader-controller";

/**
 * 阅读器页面。
 */
export default class Reader extends BasePage {
    /**
     * 保存路由提供的书籍标识与返回动作，实际数据在挂载后加载。
     * @param onReturnToBookshelf - 参数为 true 时，书籍已确认不存在，路由应丢弃失效阅读上下文。
     */
    public constructor(
        public readonly bookId: string,
        private readonly onReturnToBookshelf: (missingBook?: boolean) => void
    ) {
        super(template);
    }

    /**
     * 将本次页面的生命周期交给控制器，卸载时统一终止其异步 UI 工作。
     */
    protected override async init(readerRoot: HTMLElement, appRoot: HTMLElement): Promise<void> {
        await new ReaderController(appRoot, readerRoot, this.onReturnToBookshelf).init(
            this.bookId,
            this.lifecycleController.signal
        );
    }
}
