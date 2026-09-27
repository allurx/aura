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

import template from "./reader.html?raw";
import BasePage from "@/pages/base-page";
import ReaderController from "./reader-controller";

/**
 * 阅读器页面。
 * @author allurx
 */
export default class Reader extends BasePage {
    /**
     * 保存路由提供的书籍标识与返回动作，实际数据在挂载后加载。
     */
    public constructor(
        public readonly bookId: string,
        private readonly onReturnToBookshelf: () => void
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
