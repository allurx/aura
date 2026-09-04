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
import EventUtil from "@/util/event-util";

/**
 * 阅读器正文界面
 * @author allurx
 */
export default class ContentUi extends Ui {
    /**
     * 渲染章节
     * @param  lines - 章节内容行数组
     * @return  当前实例
     */
    public renderChapter(lines: string[]) {
        this.root.innerHTML = "";
        const fragment = document.createDocumentFragment();
        lines.forEach((line, index) => {
            const p = document.createElement("p");
            p.dataset["chapterLineNumber"] = (index + 1).toString();
            p.textContent = line;
            fragment.appendChild(p);
        });
        this.root.appendChild(fragment);
        return this;
    }

    /**
     * 恢复阅读进度,滚动到对应段落
     * @param chapterLineNumber - 当前章节内的正文行号，从 1 开始
     * @param lineVisibleRatio - 行可见比例
     * @return  当前实例
     */
    public restoreProgress(chapterLineNumber: number, lineVisibleRatio: number) {
        const p = this.root.querySelector<HTMLParagraphElement>(
            `p[data-chapter-line-number="${String(chapterLineNumber)}"]`
        );
        if (p) {
            // 先定位到大概位置
            p.scrollIntoView({ block: "start", behavior: "auto" });

            // 然后微调到精确位置
            this.root.scrollTop += p.offsetHeight * (1 - lineVisibleRatio);
        }
        return this;
    }

    /**
     * 触发内容滚动事件
     * @return  当前实例
     */
    public dispatchContentScroll() {
        this.root.dispatchEvent(new Event("scroll"));
        return this;
    }

    /**
     * 绑定内容滚动事件
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    public bindContentScroll(
        handler: (chapterLineNumber: number, lineVisibleRatio: number) => Promise<void>,
        signal: AbortSignal
    ): this {
        let timer: number | undefined;
        EventUtil.bind(
            this.root,
            "scroll",
            (_, target: HTMLElement) => {
                if (timer !== undefined) window.clearTimeout(timer);
                timer = window.setTimeout(() => {
                    EventUtil.run(async () => {
                        if (signal.aborted) return;

                        // 滚动容器可视区域
                        const cRect = target.getBoundingClientRect();

                        // 计算当前章节最上方可见的p元素
                        const line = [...target.querySelectorAll<HTMLParagraphElement>("p")]
                            .map((p: HTMLParagraphElement) => {
                                const rect = p.getBoundingClientRect();
                                const ratio =
                                    Math.max(0, Math.min(rect.bottom, cRect.bottom) - Math.max(rect.top, cRect.top)) /
                                    rect.height;
                                return {
                                    chapterLineNumber: Number(p.dataset["chapterLineNumber"]),
                                    ratio,
                                    top: rect.top,
                                    text: p.innerText,
                                };
                            })
                            .filter((item) => item.ratio > 0)
                            .sort((a, b) => a.top - b.top)
                            .at(0);

                        if (!line) return;
                        console.log("当前章节最上方可见的行: ", line);
                        await handler(line.chapterLineNumber, line.ratio);
                    });
                }, 300);
            },
            { signal }
        );

        signal.addEventListener(
            "abort",
            () => {
                if (timer !== undefined) window.clearTimeout(timer);
            },
            { once: true }
        );
        return this;
    }
}
