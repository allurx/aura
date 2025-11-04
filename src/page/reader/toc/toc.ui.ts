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

import { assertExists } from "../../../core/util/assert.util";
import EventUtil from "../../../core/util/event.util";
import Toc from "../../../domain/toc/toc.model";

/**
 * 目录面板
 * @author allurx
 */
export default class TocUi {
    private tocElement: HTMLElement;
    private tocPanelElement: HTMLElement;
    private closeTocPanelElement: HTMLElement;

    constructor() {
        this.tocElement = assertExists(document.querySelector<HTMLElement>("#toc"));
        this.tocPanelElement = assertExists(document.querySelector<HTMLElement>("#toc-panel"));
        this.closeTocPanelElement = assertExists(document.querySelector<HTMLElement>("#close-toc-panel"));
    }

    /**
     * 切换目录面板显示状态
     * @return 当前实例
     */
    toggleTocPanel() {
        this.tocPanelElement.hidden = !this.tocPanelElement.hidden;
        return this;
    }

    /**
     * 高亮目录中的当前章节
     * @param chapterIndex 章节索引
     * @return 当前实例
     */
    highlightCurrentChapter(chapterIndex: number) {
        if (!this.tocPanelElement.hidden) {
            // 移除之前的章节高亮
            this.tocElement.querySelector("p.active")?.classList.remove("active");

            // 高亮当前章节
            const currentTocElement = this.tocElement.querySelector(`p[data-index="${String(chapterIndex)}"]`);
            currentTocElement?.classList.add("active");

            // 滚动到当前章节
            currentTocElement?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return this;
    }

    /**
     * 渲染目录
     * @param  contents - 目录内容数组
     * @return 当前实例
     */
    render(contents: InstanceType<typeof Toc.Content>[]) {
        // 创建文档片段,避免多次dom操作
        const fragment = document.createDocumentFragment();

        contents.forEach((content) => {
            const p = document.createElement("p");
            p.textContent = content.title;
            p.dataset["index"] = content.index.toString();
            fragment.appendChild(p);
        });

        // 一次性添加到容器
        this.tocElement.appendChild(fragment);
        return this;
    }

    /**
     * 绑定目录项点击事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    bindTocItemClick(handler: (chapterIndex: number) => Promise<void>) {
        EventUtil.delegate(this.tocElement, "p", "click", async (_, target) => {
            await handler(Number(target.dataset["index"]));
        });
        return this;
    }

    /**
     * 绑定目录面板关闭事件
     * @return 当前实例
     */
    bindCloseTocPanel() {
        EventUtil.bind(this.closeTocPanelElement, "click", () => {
            this.tocPanelElement.hidden = true;
        });
        return this;
    }
}
