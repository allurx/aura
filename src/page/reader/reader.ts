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

/**
 * 阅读器
 * @author allurx
 */
import ReaderController from "./readerController.js";

class Reader {

    controller;

    constructor() {
        this.controller = new ReaderController();
    }

    async init() {
        const bookId = sessionStorage.getItem("bookId");
        if (!bookId) throw new Error("未从sessionStorage读取到bookId");
        await this.controller.init(bookId);
    }

}

await new Reader().init();