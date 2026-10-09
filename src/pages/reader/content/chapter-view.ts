/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Chapter from "@/domain/chapter/chapter";
import type { EpubNode } from "@/domain/file/epub-content";
import { assertExists } from "@/utils/assert-util";

/**
 * 一章受控正文及其图片 URL；窗口负责安装和释放，渲染不读取或改变阅读位置。
 */
export default class ChapterView {
    public readonly element = document.createElement("section");
    private readonly urls = new Map<string, string>();
    private readonly anchors = new Map<string, HTMLElement>();

    /**
     * 所有章节共享书籍的资源索引，各章只持有自己实际使用的 URL。
     */
    private constructor(
        public readonly chapter: Chapter,
        private readonly resources: ReadonlyMap<string, Blob> | undefined
    ) {
        this.element.className = "reading-chapter";
        this.element.dataset["chapterNumber"] = String(chapter.chapterNumber);
        this.element.setAttribute("aria-label", chapter.title);
    }

    /**
     * 在未挂载的章节中完成渲染与图片解码；失败释放本次资源，取消不提交正文。
     */
    public static async create(
        chapter: Chapter,
        resources: ReadonlyMap<string, Blob> | undefined,
        signal: AbortSignal
    ): Promise<ChapterView> {
        const view = new ChapterView(chapter, resources);
        const cancel = (): void => {
            view.dispose();
        };
        signal.addEventListener("abort", cancel, { once: true });
        try {
            if (!signal.aborted) await view.render(signal);
            return view;
        } catch (error) {
            view.dispose();
            throw error;
        } finally {
            signal.removeEventListener("abort", cancel);
        }
    }

    /**
     * 原书锚点只在当前章节内查找，不拼接选择器或污染应用 DOM ID。
     */
    public findAnchor(id: string): HTMLElement | undefined {
        return this.anchors.get(id);
    }

    /**
     * 释放当前章创建的图片 URL；可在准备失败、页面取消或窗口移除时重复调用。
     */
    public dispose(): void {
        for (const url of this.urls.values()) URL.revokeObjectURL(url);
        this.urls.clear();
        this.anchors.clear();
    }

    /**
     * TXT 物理行和 EPUB 顶层内容块各自保持稳定序号，图片尺寸不参与位置计数。
     */
    private async render(signal: AbortSignal): Promise<void> {
        const fragment = document.createDocumentFragment();
        if (this.chapter.kind === "text") {
            const heading = document.createElement("h2");
            heading.className = "chapter-heading";
            heading.textContent = this.chapter.title;
            fragment.append(heading);
            for (const [index, line] of this.chapter.lines.entries()) {
                const paragraph = document.createElement("p");
                paragraph.dataset["blockNumber"] = String(index + 1);
                paragraph.textContent = line;
                fragment.append(paragraph);
            }
        } else {
            if (!this.resources) throw new Error("Content format does not match the opened book");
            for (const anchor of this.chapter.startAnchors ?? []) this.anchors.set(anchor, this.element);
            const images: HTMLImageElement[] = [];
            this.chapter.blocks.forEach((node, index) => {
                const block = document.createElement("div");
                block.className = "epub-block";
                block.dataset["blockNumber"] = String(index + 1);
                block.append(this.createEpubNode(node, images));
                fragment.append(block);
            });

            // 取消会撤销 URL；仅忽略随取消结束的解码失败，其余错误保留原始原因。
            try {
                await Promise.all(images.map((image) => image.decode()));
            } catch (error) {
                if (!signal.aborted) throw error;
            }
        }
        if (!signal.aborted) this.element.replaceChildren(fragment);
    }

    /**
     * 将受控内容树映射为原生 DOM，逐项赋予允许的属性；链接只保存解析后的书内路径。
     */
    private createEpubNode(node: EpubNode, images: HTMLImageElement[]): Node {
        if (node.type === "text") return document.createTextNode(node.text);

        let element: HTMLElement;
        if (node.type === "image") {
            const image = document.createElement("img");
            let url = this.urls.get(node.path);
            if (!url) {
                url = URL.createObjectURL(
                    assertExists(this.resources?.get(node.path), `Missing EPUB image: ${node.path}`)
                );
                this.urls.set(node.path, url);
            }
            image.src = url;
            image.alt = node.alt;
            images.push(image);
            element = image;
        } else {
            element = document.createElement(node.tag);
            if (node.href) {
                element.setAttribute("href", "#");
                element.dataset["bookPath"] = node.href.path;
                element.dataset["bookFragment"] = node.href.fragment ?? "";
            }
            if (node.colSpan !== undefined) element.setAttribute("colspan", String(node.colSpan));
            if (node.rowSpan !== undefined) element.setAttribute("rowspan", String(node.rowSpan));
            if (node.start !== undefined) element.setAttribute("start", String(node.start));
            if (node.value !== undefined) element.setAttribute("value", String(node.value));
            if (node.reversed) element.setAttribute("reversed", "");
            if (node.dir) element.dir = node.dir;
            for (const child of node.children) element.append(this.createEpubNode(child, images));
        }
        if (node.id && !this.anchors.has(node.id)) this.anchors.set(node.id, element);
        return element;
    }
}
