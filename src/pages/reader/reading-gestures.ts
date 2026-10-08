/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind, run } from "@/utils/event-util";
import { ReadingDirection } from "./reading-direction";
import type { ReadingMode } from "./reading-mode";

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
    mode: ReadingMode;
    cancelled: boolean;
}

/**
 * 将触摸、触笔和滚轮转换为阅读意图；连续阅读保留原生滚动，鼠标短点中央只切换工具。
 * 开始和结束时均检查当前交互是否可用，页面退出时清理指针状态与全部监听。
 * @returns 取消当前候选手势；布局切换时调用，已按下的指针仍跟踪到释放或取消。
 */
export default function bindReadingGestures(
    content: HTMLElement,
    handlers: {
        isEnabled: () => boolean;
        onTurn: (direction: ReadingDirection) => Promise<void>;
        onCenterTap: () => void;
        getMode: () => ReadingMode;
    },
    signal: AbortSignal
): () => void {
    let pointer: ReadingPointer | undefined;
    const activePointers = new Set<number>();
    let wheelLastAt = Number.NEGATIVE_INFINITY;
    let wheelDistance = 0;
    let wheelAxis: "x" | "y" | undefined;
    let wheelConsumed = false;

    /**
     * 放弃当前候选，不把仍按下的其他指针误认为已经释放。
     */
    const cancel = (): void => {
        pointer = undefined;
        wheelConsumed = true;
    };

    /**
     * 轻点要求 450ms 内且两轴全程位移小于 8px；触摸或触笔轻扫至少横移 48px，偏角不超过 30°。
     * 选区、多指、取消及正文滚动均忽略，鼠标拖选不作为轻扫。
     */
    const readGesture = (current: ReadingPointer, event: PointerEvent): ReadingDirection => {
        // 先排除选区、多指、取消与滚动后的操作，再判断轻点或轻扫。
        if (
            current.cancelled ||
            !event.isPrimary ||
            event.button !== 0 ||
            activePointers.size > 0 ||
            hasSelection() ||
            handlers.getMode() !== current.mode
        )
            return ReadingDirection.INVALID;

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
        const paginated = current.mode !== "scroll" && (current.type === "touch" || current.type === "pen");

        if (!inContent) return ReadingDirection.INVALID;
        if (tap && event.timeStamp - current.startedAt <= 450) {
            if (horizontalPosition < 1 / 3) {
                return paginated ? ReadingDirection.PREV : ReadingDirection.INVALID;
            }
            if (horizontalPosition > 2 / 3) {
                return paginated ? ReadingDirection.NEXT : ReadingDirection.INVALID;
            }
            handlers.onCenterTap();
        } else if (
            paginated &&
            !hasNestedScroll(current.target, content, "x") &&
            Math.abs(deltaX) >= 48 &&
            maxY / Math.abs(deltaX) <= Math.tan(Math.PI / 6)
        ) {
            return deltaX > 0 ? ReadingDirection.PREV : ReadingDirection.NEXT;
        }
        return ReadingDirection.INVALID;
    };

    // 正文之外的指针也参与多指判断；输入识别不依赖窗口宽度或主指针媒体查询。
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
                mode: handlers.getMode(),
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
        { passive: true, capture: true, signal }
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

    // 正常抬起时先释放候选，再按当前交互状态分发一次工具或翻页操作。
    bind(
        document,
        "pointerup",
        async (event: PointerEvent) => {
            activePointers.delete(event.pointerId);
            const current = pointer;
            if (current?.id !== event.pointerId) return;
            pointer = undefined;
            if (!handlers.isEnabled()) return;
            const direction = readGesture(current, event);
            if (direction !== ReadingDirection.INVALID) await handlers.onTurn(direction);
        },
        { signal }
    );

    // 连续滚动保持原生行为；分页把一次滚轮或触控板输入及其惯性作为一次翻页。
    bind(
        content,
        "wheel",
        async (event: WheelEvent) => {
            if (
                event.defaultPrevented ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                handlers.getMode() === "scroll" ||
                !handlers.isEnabled() ||
                hasSelection() ||
                !isReadingTarget(event.target, content)
            ) {
                wheelLastAt = event.timeStamp;
                wheelConsumed = true;
                return;
            }

            const axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "x" : "y";
            if (hasNestedScroll(event.target, content, axis)) {
                wheelLastAt = event.timeStamp;
                wheelConsumed = true;
                return;
            }

            // 内嵌表格等控件先获得滚动；正文分页接管后，惯性不再滚动其他容器。
            event.preventDefault();
            if (event.timeStamp - wheelLastAt > 180) {
                wheelDistance = 0;
                wheelAxis = undefined;
                wheelConsumed = false;
            }
            wheelLastAt = event.timeStamp;
            if (wheelConsumed) return;
            wheelAxis ??= axis;

            // DOM_DELTA_LINE/PAGE 不能直接当像素；一段输入锁定主轴，避免对角惯性重复翻页。
            const unit =
                event.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? 16
                    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                      ? content.clientHeight
                      : 1;
            wheelDistance += (wheelAxis === "x" ? event.deltaX : event.deltaY) * unit;
            if (Math.abs(wheelDistance) < 48) return;
            wheelConsumed = true;
            await handlers.onTurn(wheelDistance > 0 ? ReadingDirection.NEXT : ReadingDirection.PREV);
        },
        { passive: false, signal }
    );

    // 窗口失焦或切到后台后不沿用未完成输入，也不保留缺失 pointerup 的多指状态。
    window.addEventListener(
        "blur",
        () => {
            run(() => {
                cancel();
                activePointers.clear();
            });
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
 * 内嵌滚动区域优先保留自身操作，包括表格与代码；阅读视窗本身由当前模式接管。
 */
function hasNestedScroll(target: EventTarget | null, content: HTMLElement, axis: "x" | "y"): boolean {
    if (!(target instanceof HTMLElement)) return false;
    for (
        let element: HTMLElement | null = target;
        element && element !== content && content.contains(element);
        element = element.parentElement
    ) {
        if (element.classList.contains("reading-viewport")) continue;
        const style = getComputedStyle(element);
        const scrollable =
            axis === "x"
                ? element.scrollWidth > element.clientWidth + 1 && ["auto", "scroll"].includes(style.overflowX)
                : element.scrollHeight > element.clientHeight + 1 && ["auto", "scroll"].includes(style.overflowY);
        if (scrollable) return true;
    }
    return false;
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
