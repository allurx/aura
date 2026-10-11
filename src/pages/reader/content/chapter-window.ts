/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import ChapterLayout, {
    waitForChapterLayout,
    type ChapterLayoutSeed,
    type ChapterLayoutWindow,
} from "./chapter-layout";
import type ChapterView from "./chapter-view";
import type { ContentLocation } from "./content-location";
import { locateContentRange, locateContentRect, readContentLocation } from "./content-location";
import type { ReadingMode } from "../reading-mode";
import { run } from "@/utils/event-util";

/**
 * 一个章节的有限正文窗口与可取消的排版索引；不保存阅读进度，也不改变源内容身份。
 */
export default class ChapterWindow {
    public layout: ChapterLayout;
    public range: ChapterLayoutWindow;
    public exact = false;
    private controller: AbortController | undefined;
    private probe: HTMLElement | undefined;
    private mode: ReadingMode;

    public constructor(
        public readonly view: ChapterView,
        mode: ReadingMode,
        location: ContentLocation
    ) {
        this.mode = mode;
        this.layout = this.createLayout();
        this.range = this.previewRange(location);
        this.exact =
            this.range.start === 0 &&
            this.range.carry === 0 &&
            this.range.inlineCarry === 0 &&
            !this.range.seams?.length;
        this.mount();
    }

    /**
     * 字体或视窗改变时先更新可见内容，旧索引随即失效，不沿用旧页数。
     */
    public reset(mode: ReadingMode, location: ContentLocation, preserveRange = false): void {
        this.cancel();
        const sameMode = (this.mode === "scroll") === (mode === "scroll");
        this.mode = mode;
        this.layout = this.createLayout();
        if (!preserveRange || !sameMode) {
            const range = this.previewRange(location);
            const selection = document.getSelection();
            const keepSelection =
                mode !== "scroll" &&
                selection &&
                !selection.isCollapsed &&
                selection.anchorNode &&
                selection.focusNode &&
                this.view.element.contains(selection.anchorNode) &&
                this.view.element.contains(selection.focusNode);
            // 新页界不丢弃仍在选择的源内容；只保留两个重叠的有界窗口，不扩展到全文。
            this.range = keepSelection
                ? { ...range, start: Math.min(range.start, this.range.start), end: Math.max(range.end, this.range.end) }
                : range;
            this.mount();
        }
        this.exact =
            this.range.start === 0 &&
            this.range.carry === 0 &&
            this.range.inlineCarry === 0 &&
            !this.range.seams?.length;
    }

    /**
     * 测量窗口共享正文的实际宽高与继承样式，每一轮只持有一个小片段。
     */
    public build(parent: HTMLElement, viewport: HTMLElement, signal: AbortSignal, onProgress: () => void): void {
        this.cancel();
        if (this.layout.complete) return;
        if (this.layout.batches.length > 0) this.layout = this.createLayout();
        const controller = new AbortController();
        this.controller = controller;
        const lifetime = AbortSignal.any([signal, controller.signal]);
        const bounds = viewport.getBoundingClientRect();
        const probe = document.createElement("div");
        probe.className = viewport.className;
        probe.classList.add("reading-measure-viewport");
        probe.inert = true;
        probe.setAttribute("aria-hidden", "true");
        Object.assign(probe.style, {
            width: `${bounds.width}px`,
            height: `${bounds.height}px`,
        });
        parent.append(probe);
        this.probe = probe;
        const layout = this.layout;
        const seed = this.mode === "scroll" ? undefined : this.readLayoutSeed(bounds);
        const ready = (async () => {
            try {
                await layout.build(
                    probe,
                    lifetime,
                    () => {
                        if (!lifetime.aborted) onProgress();
                    },
                    seed
                );
                if (!lifetime.aborted) onProgress();
            } finally {
                probe.remove();
                if (this.probe === probe) this.probe = undefined;
            }
        })();
        run(() => ready);
    }

    /**
     * 后台测量只补全当前画面的精确页码，不挂载正文或改变滚动位置。
     * 返回值表示当前可见窗口已与这份索引对应，可以发布页码。
     */
    public commitLayout(): boolean {
        if (this.mode === "scroll") return false;
        const pageBase = this.layout.pageBaseForWindow(this.range);
        if (pageBase === undefined) return false;
        this.range = { ...this.range, pageBase };
        this.exact = true;
        return true;
    }

    /**
     * 精确前缀尚未得到时，优先显示包含源位置的片段；得到后使用真实续排高度。
     */
    public showLocation(location: ContentLocation): boolean {
        const exact = this.layout.windowForLocation(location);
        const range = exact ?? this.previewRange(location);
        return this.replace(range, exact !== undefined || (range.start === 0 && !range.seams?.length));
    }

    /**
     * 已经建立的全局页索引可直接选择窗口；未知页面由调用方继续按源内容推进。
     */
    public showPage(pageIndex: number): boolean {
        const range = this.layout.windowForPage(pageIndex);
        return range ? this.replace(range, true) : false;
    }

    /**
     * 全章前缀尚未建立时，从当前可见内容延伸局部窗口；只测量有界正文，不等待章首索引。
     * 新窗口与旧窗口共享的首个可见源字符保持页内位置，局部页码不冒充全章页码。
     */
    public async shiftLocal(
        location: ContentLocation,
        direction: -1 | 1,
        parent: HTMLElement,
        viewport: HTMLElement,
        signal: AbortSignal
    ): Promise<boolean> {
        const layout = this.layout;
        const lifetime = this.controller ? AbortSignal.any([signal, this.controller.signal]) : signal;
        const bounds = viewport.getBoundingClientRect();
        const visible = readContentLocation(this.view.element, bounds) ?? location;
        const index = this.view.pieceIndex(visible);
        const origin = this.view.element.getBoundingClientRect();
        const gap = Number.parseFloat(getComputedStyle(this.view.element).columnGap) || 0;
        const stride = Math.max(1, bounds.width + gap);
        const visiblePage = Math.max(0, Math.round(viewport.scrollLeft / stride));
        let requiredEnd = Math.max(index, this.view.pieceIndex(location)) + 1;
        // 稳定源锚点可在当前页内部；扩窗同时保留整页正文，不能只保留页首字符。
        for (let candidate = index; candidate < this.range.end; candidate++) {
            const first = alignmentRect(this.view.element, this.view.pieceLocation(candidate));
            if (!first) continue;
            const firstPage = Math.max(0, Math.floor((first.left - origin.left + 0.01) / stride));
            if (firstPage > visiblePage) break;
            requiredEnd = Math.max(requiredEnd, candidate + 1);
        }
        let start = direction > 0 ? index : Math.max(0, this.range.start - 32);
        while (this.view.rangeEnd(start) < index && start < index) start++;
        const end = Math.min(this.view.pieceCount, Math.max(requiredEnd, this.view.rangeEnd(start)) + 1);
        if (start === this.range.start && end === this.range.end) return false;

        const shared = direction > 0 ? this.view.pieceLocation(start) : visible;
        const oldRect = alignmentRect(this.view.element, shared);
        if (!oldRect) return false;
        const oldOrigin = this.view.element.getBoundingClientRect();
        const oldPage = Math.max(0, Math.floor((oldRect.left - oldOrigin.left + 0.01) / stride));
        const wantedX = oldRect.left - oldOrigin.left - oldPage * stride;
        const wantedY = oldRect.top - oldOrigin.top;
        const probe = document.createElement("div");
        probe.className = viewport.className;
        probe.classList.add("reading-measure-viewport");
        probe.inert = true;
        probe.setAttribute("aria-hidden", "true");
        Object.assign(probe.style, { width: `${bounds.width}px`, height: `${bounds.height}px` });
        parent.append(probe);
        let carry = 0;
        let inlineCarry = 0;
        const seams = this.view.seamsInRange(start, end, this.range.seams ?? []);
        try {
            for (let attempt = 0; attempt < 4; attempt++) {
                const section = this.view.renderRange(start, end, carry, inlineCarry, seams);
                probe.replaceChildren(section);
                await waitForChapterLayout(section, lifetime);
                if (lifetime.aborted || this.layout !== layout) return false;
                const origin = section.getBoundingClientRect();
                const rect = alignmentRect(section, shared);
                if (!rect) return false;
                const page = Math.max(0, Math.floor((rect.left - origin.left + 0.01) / stride));
                const x = rect.left - origin.left - page * stride;
                const y = rect.top - origin.top;
                const xError = wantedX - x;
                const yError = wantedY - y;
                if (Math.abs(xError) < 0.1 && Math.abs(yError) < 0.1) {
                    return this.replace(
                        {
                            start,
                            end,
                            carry,
                            inlineCarry,
                            pageBase: 0,
                            top: 0,
                            height: 0,
                            ...(seams.length > 0 ? { seams } : {}),
                        },
                        start === 0 && carry === 0 && inlineCarry === 0 && seams.length === 0
                    );
                }
                if (this.view.continuesText(start) && Math.abs(xError) >= 0.1) {
                    const range = locateContentRange(section, this.view.pieceLocation(start));
                    const container = range?.startContainer;
                    const element = container instanceof Element ? container : container?.parentElement;
                    const rtl = element ? getComputedStyle(element).direction === "rtl" : false;
                    inlineCarry = modulo(inlineCarry + xError * (rtl ? -1 : 1), Math.max(1, origin.width));
                }
                carry = direction > 0 ? carry + yError : modulo(carry + yError, Math.max(1, bounds.height));
            }
            // 原生分栏可能丢弃段首 margin，使旧临时页的相位无法从更早的源起点重建。
            // 在已显示页首保留明确页界；前补内容完整结束于该源位置，不等待全章前缀或跳过文字。
            const boundary = this.view.safeBoundary(visible);
            const oldBoundary = alignmentRect(this.view.element, boundary);
            const firstLocation = this.view.pieceLocation(start);
            const pageStart =
                boundary.blockNumber !== firstLocation.blockNumber ||
                boundary.contentOffset !== firstLocation.contentOffset;
            const suffix = this.view.renderFrom(boundary, end, pageStart);
            probe.replaceChildren(suffix);
            await waitForChapterLayout(suffix, lifetime);
            if (lifetime.aborted || this.layout !== layout) return false;
            const suffixOrigin = suffix.getBoundingClientRect();
            const suffixRect = alignmentRect(suffix, boundary);
            if (!oldBoundary || !suffixRect) return false;
            const boundaryPage = Math.max(0, Math.floor((oldBoundary.left - oldOrigin.left + 0.01) / stride));
            const boundaryX = oldBoundary.left - oldOrigin.left - boundaryPage * stride;
            const range = locateContentRange(suffix, boundary);
            const container = range?.startContainer;
            const element = container instanceof Element ? container : container?.parentElement;
            const rtl = element ? getComputedStyle(element).direction === "rtl" : false;
            const seam = {
                location: boundary,
                carry: oldBoundary.top - oldOrigin.top - (suffixRect.top - suffixOrigin.top),
                inlineCarry: (boundaryX - (suffixRect.left - suffixOrigin.left)) * (rtl ? -1 : 1),
            };
            const localSeams = seams.filter(
                ({ location: point }) =>
                    point.blockNumber !== boundary.blockNumber || point.contentOffset !== boundary.contentOffset
            );
            localSeams.push(seam);
            return this.replace(
                { start, end, carry: 0, inlineCarry: 0, pageBase: 0, top: 0, height: 0, seams: localSeams },
                false
            );
        } finally {
            probe.remove();
        }
    }

    /**
     * 滚动条跳转以已测批次定位；未完成部分仅用于选择要呈现的源范围。
     * 估计位置永远不作为持久化进度，呈现后由实际文字确定阅读位置。
     */
    public locationAt(top: number): ContentLocation {
        const batch = this.layout.batches.find((item) => top >= item.top && top < item.top + item.height);
        const index = batch
            ? batch.start
            : Math.min(this.view.pieceCount - 1, Math.max(0, Math.floor(top / this.averageHeight())));
        return this.view.pieceLocation(index);
    }

    /**
     * 连续滚动保留已知全章高度，正文之外只使用不可交互的空间，不挂载隐藏全文。
     */
    public updateScrollSpace(): void {
        if (this.mode !== "scroll") return;
        const element = this.view.element;
        const currentBottom = Number.parseFloat(element.style.paddingBottom) || 0;
        const currentTop = Number.parseFloat(element.style.paddingTop) || 0;
        const contentHeight = Math.max(0, element.getBoundingClientRect().height - currentTop - currentBottom);
        const total =
            this.layout.totalHeight ??
            Math.max(this.range.top + contentHeight, this.averageHeight() * this.view.pieceCount);
        element.style.paddingTop = `${this.range.top}px`;
        element.style.paddingBottom = `${Math.max(0, total - this.range.top - contentHeight)}px`;
    }

    /**
     * 离页、换章或下一次排版取消测量，不让后台任务继续持有 DOM。
     */
    public cancel(): void {
        this.controller?.abort();
        this.controller = undefined;
        this.probe?.remove();
        this.probe = undefined;
    }

    private createLayout(): ChapterLayout {
        return new ChapterLayout(this.view, { mode: this.mode === "scroll" ? "scroll" : "paged" });
    }

    private averageHeight(): number {
        const covered = this.layout.batches.at(-1)?.end ?? 0;
        return covered > 0 && this.layout.knownHeight > 0 ? this.layout.knownHeight / covered : 80;
    }

    private previewRange(location: ContentLocation): ChapterLayoutWindow {
        const index = this.view.pieceIndex(location);
        let start = Math.max(0, index - 2);
        let end = this.view.rangeEnd(start);
        while (end <= index && start < index) {
            start++;
            end = this.view.rangeEnd(start);
        }
        const range: ChapterLayoutWindow = {
            start,
            end: Math.min(this.view.pieceCount, end + 1),
            carry: 0,
            inlineCarry: 0,
            pageBase: 0,
            top: this.mode === "scroll" ? start * this.averageHeight() : 0,
            height: 0,
        };
        if (this.mode === "scroll") return range;
        const chapterEnd = this.view.pieceEndLocation(this.view.pieceCount - 1);
        // 章末导航显示最后一页，不能把最后一个字符独立切成新的页面。
        if (location.blockNumber === chapterEnd.blockNumber && location.contentOffset === chapterEnd.contentOffset)
            return range;
        const boundary = this.view.safeBoundary(location);
        const seams = this.view.seamsInRange(start, range.end, [{ location: boundary, carry: 0, inlineCarry: 0 }]);
        return seams.length > 0 ? { ...range, seams } : range;
    }

    /**
     * 以实际可见的源边界约束后台排版，局部页号只用于推导同一画面的全章页号。
     */
    private readLayoutSeed(bounds: DOMRectReadOnly): ChapterLayoutSeed | undefined {
        const visible =
            readContentLocation(
                this.view.element,
                new DOMRect(bounds.left + 1, bounds.top, Math.max(0, bounds.width - 2), bounds.height)
            ) ?? this.view.pieceLocation(this.range.start);
        const location = this.view.safeBoundary(visible);
        const rect = alignmentRect(this.view.element, location);
        if (!rect) return undefined;
        const origin = this.view.element.getBoundingClientRect();
        const gap = Number.parseFloat(getComputedStyle(this.view.element).columnGap) || 0;
        const stride = Math.max(1, bounds.width + gap);
        const page = Math.max(0, Math.floor((rect.left - origin.left + 0.01) / stride));
        return {
            range: this.range,
            location,
            top: rect.top - origin.top,
            inline: rect.left - origin.left - page * stride,
            page,
        };
    }

    private replace(range: ChapterLayoutWindow, exact: boolean): boolean {
        const previous = this.range;
        const changed =
            previous.start !== range.start ||
            previous.end !== range.end ||
            previous.carry !== range.carry ||
            previous.inlineCarry !== range.inlineCarry ||
            previous.seams !== range.seams ||
            previous.top !== range.top;
        this.range = range;
        this.exact = exact;
        if (changed) {
            this.mount();
            if (!exact && this.mode !== "scroll") {
                this.cancel();
                this.layout = this.createLayout();
            }
        }
        return changed;
    }

    private mount(): void {
        this.view.mountRange(
            this.range.start,
            this.range.end,
            this.mode === "scroll" ? 0 : this.range.carry,
            this.range.inlineCarry,
            this.range.seams
        );
        this.view.element.style.paddingTop = this.mode === "scroll" ? `${this.range.top}px` : "";
        this.view.element.style.paddingBottom =
            this.mode === "scroll"
                ? `${Math.max(0, (this.view.pieceCount - this.range.end) * this.averageHeight())}px`
                : "";
    }
}

/**
 * 局部续排只保留一页或一行内的相位，不将未知章节前缀计入全局页码。
 */
function modulo(value: number, length: number): number {
    return ((value % length) + length) % length;
}

/**
 * 表格和预格式文本的内部滚动不属于正文分页；续排对齐其外框，保留原内部滚动状态。
 */
function alignmentRect(section: HTMLElement, location: ContentLocation): DOMRect | undefined {
    const range = locateContentRange(section, location);
    const container = range?.startContainer;
    const element = container instanceof Element ? container : container?.parentElement;
    const region = element?.closest<HTMLElement>("table, pre");
    return region && section.contains(region) ? region.getBoundingClientRect() : locateContentRect(section, location);
}
