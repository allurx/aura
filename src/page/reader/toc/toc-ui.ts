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

import Ui from "@/component/ui";
import { assertExists } from "@/util/assert-util";
import EventUtil from "@/util/event-util";
import Toc from "@/domain/toc/toc";

/**
 * 目录面板
 * @author allurx
 */
export default class TocUi extends Ui {
    private readonly tocContentElement: HTMLElement;
    private readonly closeButton: HTMLButtonElement;

    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.tocContentElement = assertExists(this.root.querySelector<HTMLElement>(".main"));
        this.closeButton = assertExists(this.root.querySelector<HTMLButtonElement>(".close"));
        this.setOpen(false);
    }

    /**
     * 切换目录面板显示状态
     * @returns 切换后是否展开
     */
    public toggleToc(): boolean {
        const open = !this.root.classList.contains("open");
        this.setOpen(open);
        return open;
    }

    /**
     * 高亮目录中的当前章节
     * @param chapterNumber 章节序号，从 1 开始
     * @return 当前实例
     */
    public highlightCurrentChapter(chapterNumber: number) {
        if (this.root.classList.contains("open")) {
            // 移除之前的章节高亮
            this.tocContentElement.querySelector("p.active")?.classList.remove("active");

            // 高亮当前章节
            const currentTocItemElement = this.tocContentElement.querySelector(
                `p[data-chapter-number="${String(chapterNumber)}"]`
            );
            currentTocItemElement?.classList.add("active");

            // 滚动到当前章节
            currentTocItemElement?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return this;
    }

    /**
     * 渲染目录
     * @param  contents - 目录内容数组
     * @return 当前实例
     */
    public renderContents(contents: InstanceType<typeof Toc.Content>[]) {
        // 创建文档片段,避免多次dom操作
        const fragment = document.createDocumentFragment();

        contents.forEach((content) => {
            const p = document.createElement("p");
            p.textContent = content.title;
            p.dataset["chapterNumber"] = content.chapterNumber.toString();
            fragment.appendChild(p);
        });

        // 一次性添加到容器
        this.tocContentElement.appendChild(fragment);
        return this;
    }

    /**
     * 绑定目录项点击事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public delegateTocItemClick(handler: (chapterNumber: number) => Promise<void>, signal: AbortSignal): this {
        EventUtil.delegate(
            this.tocContentElement,
            "p",
            "click",
            async (_, target) => {
                await handler(Number(target.dataset["chapterNumber"]));
            },
            { signal }
        );
        return this;
    }

    /**
     * 绑定关闭目录面板事件
     * @param handler - 关闭后的处理函数
     * @param signal - 页面生命周期信号
     * @returns 当前实例
     */
    public bindTocClose(handler: () => void, signal: AbortSignal): this {
        EventUtil.bind(
            this.closeButton,
            "click",
            () => {
                this.setOpen(false);
                handler();
            },
            { signal }
        );
        return this;
    }

    private setOpen(open: boolean): void {
        this.root.classList.toggle("open", open);
        this.root.inert = !open;
        this.root.setAttribute("aria-hidden", String(!open));
    }
}
