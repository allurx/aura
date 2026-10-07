/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import { bind, run } from "@/utils/event-util";
import type Chapter from "@/domain/chapter/chapter";
import type BookFile from "@/domain/file/book-file";
import EpubContent from "./epub-content";

/**
 * 同一章排版变化前的临时视觉锚点，不写入阅读进度。
 */
interface ContentPosition {
    readonly element: Element;
    readonly top: number;
    readonly height: number;
}

/**
 * 安全渲染章节正文，并分别维护临时视觉锚点和可持久化的内容位置。
 */
export default class ContentUi extends Ui {
    private scrollTimer: number | undefined;
    private epub: EpubContent | undefined;
    private signal!: AbortSignal;

    /**
     * 一次阅读会话共享图片 URL；销毁后不再接受异步呈现。
     */
    public init(file: BookFile, signal: AbortSignal): void {
        this.signal = signal;
        signal.addEventListener(
            "abort",
            () => {
                this.epub?.destroy();
            },
            { once: true }
        );
        if (file.format === "epub") this.epub = new EpubContent(file.resources);
    }

    /**
     * 各格式按自己的内容语义呈现，所有异步资源就绪后才允许恢复进度。
     */
    public async renderChapter(chapter: Chapter): Promise<void> {
        // 停止旧正文的延迟读取，在未挂载的片段中组装新章节。
        this.cancelPendingScroll();
        if (this.signal.aborted) return;
        if (chapter.kind === "epub" && this.epub) {
            await this.epub.render(this.root, chapter.blocks, this.signal);
            return;
        }
        if (chapter.kind !== "text") throw new Error("Content format does not match the opened book");
        const fragment = document.createDocumentFragment();

        // 章节标题独立于正文行号，不参与持久化进度定位。
        const heading = document.createElement("h2");
        heading.className = "chapter-heading";
        heading.textContent = chapter.title;
        fragment.appendChild(heading);

        // 每个原始行对应一个安全文本节点，换行布局变化不改变行号契约。
        chapter.lines.forEach((line, index) => {
            const paragraph = document.createElement("p");
            paragraph.dataset["blockNumber"] = String(index + 1);
            paragraph.textContent = line;
            fragment.appendChild(paragraph);
        });

        // 操作按钮由外部工具栏持有，正文只保留自然块布局。
        this.root.replaceChildren(fragment);
    }

    /**
     * 将书内链接交给阅读控制器，保留同章与跨章的统一进度保存路径。
     */
    public bindBookLinks(handler: (path: string, fragment: string) => Promise<void>, signal: AbortSignal): void {
        bind(
            this.root,
            "click",
            async (event: MouseEvent) => {
                if (!(event.target instanceof Element)) return;
                const link = event.target.closest<HTMLElement>("a[data-book-path]");
                if (!link || !this.root.contains(link)) return;
                event.preventDefault();
                await handler(link.dataset["bookPath"] ?? "", link.dataset["bookFragment"] ?? "");
            },
            { signal }
        );
    }

    /**
     * 根据受控锚点映射定位，空片段表示文档开头。
     */
    public scrollToFragment(fragment: string): void {
        const element = this.epub?.findAnchor(fragment);
        if (!fragment) this.root.scrollTop = 0;
        else if (element)
            this.root.scrollTop += element.getBoundingClientRect().top - this.root.getBoundingClientRect().top;
        this.dispatchContentScroll();
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
            position = {
                element,
                top: bounds.top - top,
                height: bounds.height,
            };
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
     * 按内容块和块内比例恢复位置，不依赖旧排版的像素偏移。
     * @param blockNumber - 当前阅读单元内从 1 开始的内容块序号。
     * @param blockVisibleRatio - 内容块在视口上缘以下的剩余比例；1 表示从段首开始。
     */
    public restoreProgress(blockNumber: number, blockVisibleRatio: number): this {
        // 首行完整可见代表章首；保留标题与正文之间的阅读留白。
        if (blockNumber === 1 && blockVisibleRatio === 1) {
            this.root.scrollTop = 0;
            return this;
        }

        // 用新布局下的段落高度换算偏移，目标缺失时保持现有滚动位置。
        const paragraph = this.root.querySelector<HTMLElement>(`[data-block-number="${String(blockNumber)}"]`);
        if (paragraph) {
            const top = paragraph.getBoundingClientRect().top - this.root.getBoundingClientRect().top;
            this.root.scrollTop += top + paragraph.offsetHeight * (1 - blockVisibleRatio);
        }
        return this;
    }

    /**
     * 获取视口上缘所在内容块；超长段落使用上缘比例恢复位置。
     * @returns 内容块序号与可见比例；当前阅读单元没有正文时返回 undefined。
     */
    public readProgress(): { blockNumber: number; blockVisibleRatio: number } | undefined {
        const viewport = this.root.getBoundingClientRect();
        const paragraphs = this.root.querySelectorAll<HTMLElement>("[data-block-number]");

        // 标题可能因长文本或大字号占满视口，此时仍是章首而非章末。
        const firstParagraph = paragraphs[0];
        if (firstParagraph && firstParagraph.getBoundingClientRect().top >= viewport.top) {
            return { blockNumber: 1, blockVisibleRatio: 1 };
        }

        // 以首个可见段落为锚点，比例只描述视口上缘切入段落的位置。
        for (const paragraph of paragraphs) {
            const rect = paragraph.getBoundingClientRect();
            if (rect.height <= 0 || rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
            return {
                blockNumber: Number(paragraph.dataset["blockNumber"]),
                blockVisibleRatio: Math.min(1, Math.max(0, (rect.bottom - viewport.top) / rect.height)),
            };
        }

        // 正文已滚过视口时记录章末，空章节则不产生可保存的位置。
        const lastParagraph = paragraphs[paragraphs.length - 1];
        return lastParagraph
            ? {
                  blockNumber: Number(lastParagraph.dataset["blockNumber"]),
                  blockVisibleRatio: 0,
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
     * 滚动停止后向调用方报告当前位置，页面销毁时清理定时器。
     */
    public bindContentScroll(
        handler: (blockNumber: number, blockVisibleRatio: number) => Promise<void>,
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
                        if (progress) await handler(progress.blockNumber, progress.blockVisibleRatio);
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
