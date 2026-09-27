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

import Ui from "@/components/ui";
import { assertExists } from "@/utils/assert-util";

/**
 * 阅读器头部界面
 * @author allurx
 */
export default class HeaderUi extends Ui {
    private readonly bookTitle: HTMLElement;

    /**
     * 绑定书名，跨布局的操作由阅读器统一管理。
     */
    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.bookTitle = assertExists(this.root.querySelector<HTMLElement>("#book-title"));
    }

    /**
     * 显示书名，长文件名保留原文供辅助技术和悬停查看。
     */
    public renderBookTitle(title: string): this {
        this.bookTitle.textContent = title.replace(/\.txt$/i, "");
        this.bookTitle.title = title;
        return this;
    }
}
