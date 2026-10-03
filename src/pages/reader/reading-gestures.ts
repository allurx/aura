/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "@/utils/event-util";
import { SwitchChapterDirection } from "./switch-chapter-direction";

/**
 * 一次主指针操作；多指、取消或正文滚动会使本次手势失效。
 */
interface ReadingPointer {
    id: number;
    type: string;
    target: EventTarget | null;
    startX: number;
    startY: number;
    // 保留全程最大位移，避免拖动后回到起点被误判为轻点。
    maxX: number;
    maxY: number;
    startedAt: number;
    scrollTop: number;
    cancelled: boolean;
}

/**
 * 将正文两侧轻点、横向轻扫和中心轻点转换为阅读意图，保留原生滚动与文字选择。
 * 开始和结束时均检查当前交互是否可用，页面退出时清理指针状态与全部监听。
 * @returns 取消当前候选手势；布局切换时调用，已按下的指针仍跟踪到释放或取消。
 */
export default function bindReadingGestures(
    content: HTMLElement,
    handlers: {
        isEnabled: () => boolean;
        onChapter: (direction: SwitchChapterDirection) => Promise<void>;
        onCenterTap: () => void;
    },
    signal: AbortSignal
): () => void {
    let pointer: ReadingPointer | undefined;
    const activePointers = new Set<number>();

    /**
     * 放弃当前候选，不把仍按下的其他指针误认为已经释放。
     */
    const cancel = (): void => {
        pointer = undefined;
    };

    /**
     * 轻点要求 450ms 内且两轴全程位移小于 8px；触摸或触笔轻扫至少横移 48px，偏角不超过 30°。
     * 选区、多指、取消及正文滚动均忽略，鼠标拖选不作为轻扫。
     */
    const readGesture = (current: ReadingPointer, event: PointerEvent): SwitchChapterDirection => {
        // 先排除选区、多指、取消与滚动后的操作，再判断轻点或轻扫。
        if (
            current.cancelled ||
            !event.isPrimary ||
            event.button !== 0 ||
            activePointers.size > 0 ||
            hasSelection() ||
            Math.abs(content.scrollTop - current.scrollTop) > 1
        )
            return SwitchChapterDirection.INVALID;

        // 用全程位移判定轻点，再按正文的实际边界划分左右与中央区域。
        const deltaX = event.clientX - current.startX;
        const deltaY = event.clientY - current.startY;
        const maxX = Math.max(current.maxX, Math.abs(deltaX));
        const maxY = Math.max(current.maxY, Math.abs(deltaY));
        const tap = maxX < 8 && maxY < 8;
        const bounds = content.getBoundingClientRect();
        const inContent =
            isReadingTarget(current.target, content) &&
            isReadingTarget(event.target, content) &&
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom;
        const horizontalPosition = (event.clientX - bounds.left) / bounds.width;

        if (!inContent) return SwitchChapterDirection.INVALID;
        if (tap && event.timeStamp - current.startedAt <= 450) {
            if (horizontalPosition < 1 / 3) return SwitchChapterDirection.PREV;
            if (horizontalPosition > 2 / 3) return SwitchChapterDirection.NEXT;
            handlers.onCenterTap();
        } else if (
            (current.type === "touch" || current.type === "pen") &&
            Math.abs(deltaX) >= 48 &&
            maxY / Math.abs(deltaX) <= Math.tan(Math.PI / 6)
        ) {
            return deltaX > 0 ? SwitchChapterDirection.PREV : SwitchChapterDirection.NEXT;
        }
        return SwitchChapterDirection.INVALID;
    };

    // 正文之外的指针也参与多指判断，只在可用布局中为单个主指针建立候选。
    bind(
        document,
        "pointerdown",
        (event: PointerEvent) => {
            activePointers.add(event.pointerId);
            if (!event.isPrimary || activePointers.size !== 1 || event.button !== 0) {
                if (pointer) pointer.cancelled = true;
                return;
            }
            if (!handlers.isEnabled() || !isReadingTarget(event.target, content)) return;
            pointer = {
                id: event.pointerId,
                type: event.pointerType,
                target: event.target,
                startX: event.clientX,
                startY: event.clientY,
                maxX: 0,
                maxY: 0,
                startedAt: event.timeStamp,
                scrollTop: content.scrollTop,
                cancelled: hasSelection(),
            };
        },
        { signal }
    );

    // 记录全程移动范围，拖动后返回起点也不能重新成为轻点。
    bind(
        document,
        "pointermove",
        (event: PointerEvent) => {
            if (pointer?.id !== event.pointerId) return;
            pointer.maxX = Math.max(pointer.maxX, Math.abs(event.clientX - pointer.startX));
            pointer.maxY = Math.max(pointer.maxY, Math.abs(event.clientY - pointer.startY));
        },
        { passive: true, signal }
    );

    // 浏览器滚动和系统取消均终止候选，保留原生滚动与选择行为。
    bind(
        content,
        "scroll",
        () => {
            if (pointer) pointer.cancelled = true;
        },
        { passive: true, signal }
    );
    bind(
        document,
        "pointercancel",
        (event: PointerEvent) => {
            activePointers.delete(event.pointerId);
            if (pointer?.id === event.pointerId) cancel();
        },
        { signal }
    );

    // 正常抬起时先释放候选，再按当前交互状态分发一次工具或切章操作。
    bind(
        document,
        "pointerup",
        async (event: PointerEvent) => {
            activePointers.delete(event.pointerId);
            const current = pointer;
            if (current?.id !== event.pointerId) return;
            cancel();
            if (!handlers.isEnabled()) return;
            const direction = readGesture(current, event);
            if (direction !== SwitchChapterDirection.INVALID) await handlers.onChapter(direction);
        },
        { signal }
    );

    signal.addEventListener(
        "abort",
        () => {
            cancel();
            activePointers.clear();
        },
        { once: true }
    );
    return cancel;
}

/**
 * 仅正文内的非交互元素可触发手势，链接与控件保留自身行为。
 */
function isReadingTarget(target: EventTarget | null, content: HTMLElement): boolean {
    return (
        target instanceof HTMLElement &&
        (target === content || content.contains(target)) &&
        !target.closest("button, a, input, textarea, select, summary, [contenteditable]")
    );
}

/**
 * 已有选区的清除以及正在创建的选区都不能误触阅读手势。
 */
function hasSelection(): boolean {
    const selection = window.getSelection();
    return selection !== null && !selection.isCollapsed;
}
