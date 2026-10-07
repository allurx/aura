/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EpubNode, EpubResource } from "@/domain/file/epub";
import { assertExists } from "@/utils/assert-util";

/**
 * 将导入时建立的受控内容树映射为原生 DOM；原书 HTML、CSS 和脚本不进入页面。
 */
export default class EpubContent {
    private readonly urls = new Map<string, string>();
    private readonly anchors = new Map<string, HTMLElement>();
    private readonly images: HTMLImageElement[] = [];
    private readonly resources: Map<string, Blob>;

    public constructor(resources: EpubResource[]) {
        this.resources = new Map(resources.map(({ path, blob }) => [path, blob]));
    }

    /**
     * 每个顶层结构块拥有稳定进度序号，排版与图片加载不改变序号。
     */
    public async render(root: HTMLElement, blocks: EpubNode[], signal: AbortSignal): Promise<void> {
        this.anchors.clear();
        this.images.length = 0;
        const fragment = document.createDocumentFragment();
        blocks.forEach((node, index) => {
            const block = document.createElement("div");
            block.className = "epub-block";
            block.dataset["blockNumber"] = String(index + 1);
            block.append(this.createNode(node));
            fragment.append(block);
        });
        root.replaceChildren(fragment);

        // 所有图片具备最终尺寸后才恢复阅读锚点，避免迟到的图片推走正文。
        try {
            await Promise.all(this.images.map((image) => image.decode()));
        } catch (error) {
            // 页面退出会主动撤销图片 URL；已取消的呈现不再向新页面报告解码失败。
            if (!signal.aborted) throw error;
        }
    }

    /**
     * 原书锚点只在当前章节的映射中查找，不拼接选择器或污染应用 DOM ID。
     */
    public findAnchor(id: string): HTMLElement | undefined {
        return this.anchors.get(id);
    }

    /**
     * 离开书籍时释放由当前阅读会话持有的图片 URL。
     */
    public destroy(): void {
        for (const url of this.urls.values()) URL.revokeObjectURL(url);
        this.urls.clear();
        this.anchors.clear();
    }

    /**
     * 属性逐项按语义赋值；链接只向控制器发送已解析的书内路径。
     */
    private createNode(node: EpubNode): Node {
        if (node.type === "text") return document.createTextNode(node.text);

        let element: HTMLElement;
        if (node.type === "image") {
            const image = document.createElement("img");
            let url = this.urls.get(node.path);
            if (!url) {
                url = URL.createObjectURL(
                    assertExists(this.resources.get(node.path), `Missing EPUB image: ${node.path}`)
                );
                this.urls.set(node.path, url);
            }
            image.src = url;
            image.alt = node.alt;
            this.images.push(image);
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
            if (node.reversed) element.setAttribute("reversed", "");
            if (node.dir) element.dir = node.dir;
            for (const child of node.children) element.append(this.createNode(child));
        }
        if (node.id && !this.anchors.has(node.id)) this.anchors.set(node.id, element);
        return element;
    }
}
