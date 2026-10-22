/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReadingMode } from "../reading-mode";

/**
 * 一张有限正文投影及其纸面；视窗保持与真实正文相同的容器查询尺寸。
 */
export interface PaperPage {
    readonly element: HTMLDivElement;
    readonly viewport: HTMLDivElement;
}

/**
 * 翻页只移动本地纸面，不接管命中测试、焦点或阅读位置。内容与资源由正文会话持有。
 */
export default class PageTurnUi {
    public readonly current: PaperPage;
    public readonly width: number;
    private readonly root = document.createElement("div");
    private target: PaperPage | undefined;
    private positions: readonly [number, number] = [0, 0];
    private animations: Animation[] = [];
    private finishAnimation: (() => void) | undefined;

    public constructor(
        private readonly content: HTMLElement,
        private readonly viewport: HTMLElement,
        private readonly mode: ReadingMode
    ) {
        this.root.className = "reading-papers";
        this.root.inert = true;
        this.root.setAttribute("aria-hidden", "true");
        this.width = content.clientWidth;
        content.append(this.root);
        this.current = this.createPage();
        this.current.element.style.visibility = "visible";
    }

    /**
     * 预备页仍参与同尺寸排版，但完成定位前不会进入可见画面。
     */
    public createPage(): PaperPage {
        const element = document.createElement("div");
        element.className = "reading-paper";
        const viewport = document.createElement("div");
        viewport.className = "reading-viewport reading-paper-viewport";
        const bounds = this.viewport.getBoundingClientRect();
        const parent = this.content.getBoundingClientRect();
        Object.assign(viewport.style, {
            left: `${String(bounds.left - parent.left - this.content.clientLeft)}px`,
            top: `${String(bounds.top - parent.top - this.content.clientTop)}px`,
            width: `${String(bounds.width)}px`,
            height: `${String(bounds.height)}px`,
        });
        element.append(viewport);
        this.root.append(element);
        return { element, viewport };
    }

    /**
     * 保存当前已渲染的有限窗口，也复制表格等内部滚动位置，保持按下时的完整画面。
     */
    public capture(): void {
        this.current.viewport.replaceChildren(...[...this.viewport.childNodes].map((node) => node.cloneNode(true)));
        copyScrollPositions(this.viewport, this.current.viewport);
    }

    /**
     * 位移来自手指。准备期间保留原画面，只有已确认的书界才显示小幅阻力。
     */
    public move(offset: number, target: PaperPage | undefined, direction: -1 | 1, resolved = false): void {
        if (this.target && this.target !== target) this.target.element.style.visibility = "hidden";
        this.target = target;
        const previous = direction < 0;
        const distance = Math.max(-this.width, Math.min(this.width, offset));
        this.positions = this.transforms(distance, target !== undefined, direction, resolved);
        const [current, incoming] = this.positions;
        this.current.element.style.transform = `translateX(${String(current)}px)`;
        this.current.element.style.zIndex = previous && this.mode === "cover" ? "2" : "1";
        this.current.element.classList.toggle("moving-edge", previous && this.mode === "cover" && !!target);
        if (target) {
            target.element.style.visibility = "visible";
            target.element.style.transform = `translateX(${String(incoming)}px)`;
            target.element.style.zIndex = previous && this.mode === "cover" ? "1" : "2";
            target.element.classList.toggle("moving-edge", !previous && this.mode === "cover");
        }
    }

    /**
     * 释放后只播放剩余距离。新的操作可同步结束尾段，已经提交的导航由调用方保留。
     */
    public settle(target: PaperPage | undefined, direction: -1 | 1, commit: boolean): Promise<void> {
        // 松手时目标才就绪就从原画面进入；已经跟手呈现的纸面沿用最后坐标，不重新摆到理论位移。
        if (this.target !== target) this.move(0, target, direction);
        if (
            this.mode === "none" ||
            matchMedia("(prefers-reduced-motion: reduce)").matches ||
            typeof this.root.animate !== "function"
        )
            return Promise.resolve();
        const end = commit ? -direction * this.width : 0;
        const from = this.positions;
        const to = this.transforms(end, target !== undefined, direction, true);
        const distance = Math.max(Math.abs(to[0] - from[0]), target ? Math.abs(to[1] - from[1]) : 0);
        if (distance < 0.5) return Promise.resolve();
        // 短回位也有完整的减速过程，不因剩余路程短而压缩成一次闪动。
        const duration = 230 + Math.round(60 * Math.min(1, distance / this.width));
        const layers = target ? [this.current.element, target.element] : [this.current.element];
        this.animations = layers.map((element, index) =>
            element.animate(
                [
                    { transform: `translateX(${String(from[index])}px)` },
                    { transform: `translateX(${String(to[index])}px)` },
                ],
                { duration, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)", fill: "both" }
            )
        );
        return new Promise<void>((resolve, reject) => {
            this.finishAnimation = resolve;
            void Promise.all(this.animations.map((animation) => animation.finished)).then(
                () => {
                    resolve();
                },
                (error: unknown) => {
                    if (error instanceof DOMException && error.name === "AbortError") resolve();
                    else
                        reject(
                            error instanceof Error ? error : new Error("Failed to finish page motion", { cause: error })
                        );
                }
            );
        });
    }

    /**
     * 移除视觉资源，并释放等待尾段的调用方；不会改变正文或撤销导航。
     */
    public dispose(): void {
        for (const animation of this.animations) animation.cancel();
        this.animations = [];
        this.finishAnimation?.();
        this.finishAnimation = undefined;
        this.root.remove();
    }

    private transforms(
        offset: number,
        prepared: boolean,
        direction: -1 | 1,
        resolved: boolean
    ): readonly [number, number] {
        // 真实书界只给最多约 8px 的连续阻尼；准备期间保持原位，不产生假边界反馈。
        if (!prepared) return [resolved ? 8 * Math.tanh(offset / 80) : 0, 0];
        if (this.mode === "slide") return [offset, offset + direction * this.width];
        return direction < 0 ? [offset, 0] : [0, this.width + offset];
    }
}

/**
 * cloneNode 不复制滚动状态；只恢复正文视窗与受控的表格、代码容器，避免逐个读取普通文本元素。
 */
function copyScrollPositions(source: HTMLElement, target: HTMLElement): void {
    const originals = [source, ...source.querySelectorAll<HTMLElement>("table, pre")];
    const copies = [target, ...target.querySelectorAll<HTMLElement>("table, pre")];
    for (const [index, original] of originals.entries()) {
        const copy = copies[index];
        if (!copy) continue;
        copy.scrollLeft = original.scrollLeft;
        copy.scrollTop = original.scrollTop;
    }
}
