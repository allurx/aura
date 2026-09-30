/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import { bind, run } from "@/utils/event-util";

/**
 * 同一章排版变化前的临时视觉锚点，不写入阅读进度。
 */
interface ContentPosition {
    readonly element: Element;
    readonly top: number;
    readonly height: number;
}

/**
 * 阅读器正文界面
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
     * 保存视口上缘附近的标题或段落，保留部分标题和段前空白。
     * 锚点仅用于同一章的外观调整或全屏切换，不替代持久化进度。
     */
    public readPosition(): ContentPosition | undefined {
        const top = this.root.getBoundingClientRect().top;
        let position: ContentPosition | undefined;
        for (const element of this.root.children) {
            const bounds = element.getBoundingClientRect();
            if (bounds.height <= 0) continue;
            position = { element, top: bounds.top - top, height: bounds.height };
            if (bounds.bottom > top) break;
        }
        return position;
    }

    /**
     * 按最终排版恢复临时锚点；节点内部保留比例，节点前的空白保留像素距离。
     * 章节已被替换时不把旧锚点应用到新正文。
     */
    public restorePosition(position: ContentPosition): this {
        if (position.element.parentElement !== this.root) return this;
        const bounds = position.element.getBoundingClientRect();
        const offset = position.top < 0 ? (position.top / position.height) * bounds.height : position.top;
        this.root.scrollTop += bounds.top - this.root.getBoundingClientRect().top - offset;
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
        bind(
            this.root,
            "scroll",
            () => {
                this.cancelPendingScroll();
                this.scrollTimer = window.setTimeout(() => {
                    this.scrollTimer = undefined;
                    run(async () => {
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
}
