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
import BasePage from "@/page/base-page";
import ReaderController from "./reader-controller";

/**
 * 阅读器页面。
 * @author allurx
 */
export default class Reader extends BasePage {
    public constructor(public readonly bookId: string) {
        super(template);
        if (!bookId) throw new Error("bookId must not be empty");
    }

    protected override async init(readerRoot: HTMLElement, appRoot: HTMLElement): Promise<void> {
        await new ReaderController(appRoot, readerRoot).init(this.bookId, this.lifecycleController.signal);
    }
}
