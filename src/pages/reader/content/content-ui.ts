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

import { SwitchChapterDirection } from "../switch-chapter-direction";
import Ui from "@/components/ui";
import EventUtil from "@/utils/event-util";

/**
 * 阅读器正文界面
 * @author allurx
 */
export default class ContentUi extends Ui {
    private scrollTimer: number | undefined;

    /**
     * 标题与正文使用文本节点渲染，段落行号继续对应已有进度模型。
     * @param lines - 当前章的原始文本行，索引加一作为恢复进度的行号。
     */
    public renderChapter(title: string, lines: string[]): this {
        // 停止旧正文的延迟读取，在离线片段中组装新章节。
        this.cancelPendingScroll();
        const fragment = document.createDocumentFragment();

        // 章节标题独立于正文行号，不参与持久化进度定位。
        const heading = document.createElement("h2");
        heading.className = "chapter-heading";
        heading.textContent = title;
        fragment.appendChild(heading);

        // 每个原始行对应一个安全文本节点，换行布局变化不改变行号契约。
        lines.forEach((line, index) => {
            const paragraph = document.createElement("p");
            paragraph.dataset["chapterLineNumber"] = String(index + 1);
            paragraph.textContent = line;
            fragment.appendChild(paragraph);
        });

        // 操作按钮由外部工具栏持有，正文只保留自然块布局。
        this.root.replaceChildren(fragment);
        return this;
    }

    /**
     * 按原始行号和段内比例恢复位置，不依赖旧字号下的像素偏移。
     * @param chapterLineNumber - 当前章内从 1 开始的原始文本行号。
     * @param lineVisibleRatio - 段落在视口上缘以下的剩余比例；1 表示从段首开始。
     */
    public restoreProgress(chapterLineNumber: number, lineVisibleRatio: number): this {
        // 首行完整可见代表章首；保留标题与正文之间的阅读留白。
        if (chapterLineNumber === 1 && lineVisibleRatio === 1) {
            this.root.scrollTop = 0;
            return this;
        }

        // 用新布局下的段落高度换算偏移，目标缺失时保持现有滚动位置。
        const paragraph = this.root.querySelector<HTMLParagraphElement>(
            `p[data-chapter-line-number="${String(chapterLineNumber)}"]`
        );
        if (paragraph) {
            const top = paragraph.getBoundingClientRect().top - this.root.getBoundingClientRect().top;
            this.root.scrollTop += top + paragraph.offsetHeight * (1 - lineVisibleRatio);
        }
        return this;
    }

    /**
     * 获取视口上缘所在行；超长段落使用上缘比例以支持准确恢复。
     * @returns 行号与段内剩余比例；当前章没有正文行时返回 undefined。
     */
    public readProgress(): { chapterLineNumber: number; lineVisibleRatio: number } | undefined {
        const viewport = this.root.getBoundingClientRect();
        const paragraphs = this.root.querySelectorAll<HTMLParagraphElement>("p[data-chapter-line-number]");

        // 标题可能因长文本或大字号占满视口，此时仍是章首而非章末。
        const firstParagraph = paragraphs[0];
        if (firstParagraph && firstParagraph.getBoundingClientRect().top >= viewport.top) {
            return { chapterLineNumber: 1, lineVisibleRatio: 1 };
        }

        // 以首个可见段落为锚点，比例只描述视口上缘切入段落的位置。
        for (const paragraph of paragraphs) {
            const rect = paragraph.getBoundingClientRect();
            if (rect.height <= 0 || rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
            return {
                chapterLineNumber: Number(paragraph.dataset["chapterLineNumber"]),
                lineVisibleRatio: Math.min(1, Math.max(0, (rect.bottom - viewport.top) / rect.height)),
            };
        }

        // 正文已滚过视口时记录章末，空章节则不产生可保存的位置。
        const lastParagraph = paragraphs[paragraphs.length - 1];
        return lastParagraph
            ? {
                  chapterLineNumber: Number(lastParagraph.dataset["chapterLineNumber"]),
                  lineVisibleRatio: 0,
              }
            : undefined;
    }

    /**
     * 触发布局变化后的进度同步。
     */
    public dispatchContentScroll(): this {
        this.root.dispatchEvent(new Event("scroll"));
        return this;
    }

    /**
     * 取消尚未触发的滚动回调，避免切章或外观预览时读错位置；已提交写入不受影响。
     */
    public cancelPendingScroll(): void {
        if (this.scrollTimer !== undefined) window.clearTimeout(this.scrollTimer);
        this.scrollTimer = undefined;
    }

    /**
     * 在滚动停止后提交进度，页面销毁时清理定时器。
     */
    public bindContentScroll(
        handler: (chapterLineNumber: number, lineVisibleRatio: number) => Promise<void>,
        signal: AbortSignal
    ): this {
        // 滚动停止后再读取当前几何位置，避免每次滚动事件都提交存储。
        EventUtil.bind(
            this.root,
            "scroll",
            () => {
                this.cancelPendingScroll();
                this.scrollTimer = window.setTimeout(() => {
                    this.scrollTimer = undefined;
                    EventUtil.run(async () => {
                        if (signal.aborted) return;
                        const progress = this.readProgress();
                        if (progress) await handler(progress.chapterLineNumber, progress.lineVisibleRatio);
                    });
                }, 300);
            },
            { signal }
        );

        // 页面退出时取消未执行的回调，已提交写入仍由控制器负责收尾。
        signal.addEventListener(
            "abort",
            () => {
                this.cancelPendingScroll();
            },
            { once: true }
        );
        return this;
    }

    /**
     * 绑定正文中的左右键，保留控件自身键盘行为。
     */
    public bindKeyboardNavigation(
        handler: (direction: SwitchChapterDirection) => Promise<void>,
        signal: AbortSignal
    ): this {
        // 只有普通正文焦点接受方向键，控件编辑、修饰键与长按重复均保留原行为。
        EventUtil.bind(
            document,
            "keydown",
            async (event: KeyboardEvent) => {
                if (
                    event.defaultPrevented ||
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey ||
                    event.repeat
                )
                    return;
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                if (target !== document.body && target !== this.root && !this.root.contains(target)) return;
                if (target.closest("button, a, input, textarea, select, summary, [contenteditable], [role=dialog]"))
                    return;
                const direction =
                    event.key === "ArrowLeft"
                        ? SwitchChapterDirection.PREV
                        : event.key === "ArrowRight"
                          ? SwitchChapterDirection.NEXT
                          : SwitchChapterDirection.INVALID;
                if (direction === SwitchChapterDirection.INVALID) return;
                event.preventDefault();
                await handler(direction);
            },
            { signal }
        );
        return this;
    }
}
