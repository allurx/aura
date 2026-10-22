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
    width: number;
    systemEdge: boolean;
    phase: "pending" | "swipe" | "drag";
    offset: number;
    samples: { x: number; at: number }[];
}

/**
 * 阅读输入产生导航意图；正文负责准备、呈现和提交拖动中的页面。
 * 拖动起点返回 false 表示本次操作未被接受，不在松手后重试为普通翻页。
 */
export interface ReadingNavigationHandlers {
    onTurn: (direction: ReadingDirection) => Promise<void>;
    onChapter: (direction: ReadingDirection) => Promise<void>;
    onCenterTap: () => void;
    getMode: () => ReadingMode;
    onDragStart: () => boolean;
    // 相对按下位置的水平 CSS 像素：负值前进，正值后退，可连续反拉或改向。
    onDragMove: (offset: number) => void;
    onDragEnd: (commit: boolean) => Promise<void>;
    onDragCancel: () => void;
}

/**
 * 将正文键盘、触摸、触笔和滚轮转换为阅读意图，内嵌控件优先保留自身操作。
 * 开始和结束时均检查当前交互是否可用，页面退出时清理指针状态与全部监听。
 * @returns 取消当前候选手势；布局切换时调用，已按下的指针仍跟踪到释放或取消。
 */
export default function bindReadingInput(
    content: HTMLElement,
    handlers: ReadingNavigationHandlers & { isEnabled: () => boolean },
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
        const current = pointer;
        pointer = undefined;
        wheelConsumed = true;
        if (!current) return;
        if (content.hasPointerCapture(current.id)) content.releasePointerCapture(current.id);
        if (current.phase === "drag") handlers.onDragCancel();
    };

    // 键盘与指针共用正文资格判断；各按键仍保留自己的方向、修饰键及重复语义。
    bind(
        document,
        "keydown",
        async (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                cancel();
                return;
            }
            if (
                event.defaultPrevented ||
                event.altKey ||
                event.metaKey ||
                event.isComposing ||
                event.repeat ||
                hasSelection() ||
                !handlers.isEnabled()
            )
                return;
            const target = event.target;
            if (target !== document.body && !isReadingTarget(target, content)) return;
            if (event.ctrlKey) {
                if (event.shiftKey || (event.key !== "PageUp" && event.key !== "PageDown")) return;
                event.preventDefault();
                cancel();
                await handlers.onChapter(event.key === "PageUp" ? ReadingDirection.PREV : ReadingDirection.NEXT);
                return;
            }
            if (event.shiftKey && event.key !== " ") return;
            const direction =
                event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)
                    ? ReadingDirection.PREV
                    : event.key === "ArrowRight" || event.key === "PageDown" || event.key === " "
                      ? ReadingDirection.NEXT
                      : ReadingDirection.INVALID;
            if (direction === ReadingDirection.INVALID) return;
            const axis = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "x" : "y";
            if (hasNestedScroll(target, content, axis)) return;
            event.preventDefault();
            cancel();
            await handlers.onTurn(direction);
        },
        { signal }
    );

    /**
     * 轻点要求 450ms 内且两轴全程位移小于 8px；窄边缘翻页，其余区域唤出工具。
     * 鼠标保留选字，只有触摸和触笔使用两侧的翻页区域。
     */
    const readTap = (current: ReadingPointer, event: PointerEvent): ReadingDirection => {
        if (current.maxX >= 8 || current.maxY >= 8 || event.timeStamp - current.startedAt > 450)
            return ReadingDirection.INVALID;
        const bounds = content.getBoundingClientRect();
        const inContent =
            isReadingGestureTarget(current.target, content) &&
            isReadingGestureTarget(event.target, content) &&
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom;
        const horizontalPosition = event.clientX - bounds.left;
        const edge = Math.max(44, bounds.width * 0.14);
        const paginated = current.mode !== "scroll" && (current.type === "touch" || current.type === "pen");

        // 独立滚动内容的轻点也归其自身处理，不能因没有实际滚动而翻页或切换阅读工具。
        if (
            !inContent ||
            hasNestedScroll(current.target, content, "x") ||
            hasNestedScroll(current.target, content, "y")
        )
            return ReadingDirection.INVALID;
        if (horizontalPosition < edge) {
            return paginated ? ReadingDirection.PREV : ReadingDirection.INVALID;
        }
        if (horizontalPosition > bounds.width - edge) {
            return paginated ? ReadingDirection.NEXT : ReadingDirection.INVALID;
        }
        handlers.onCenterTap();
        return ReadingDirection.INVALID;
    };

    /**
     * 位移保留整段手势的范围，速度只取最近 100ms；停住再松手不能沿用此前的快甩速度。
     */
    const recordMovement = (current: ReadingPointer, event: PointerEvent): void => {
        current.offset = event.clientX - current.startX;
        current.maxX = Math.max(current.maxX, Math.abs(current.offset));
        current.maxY = Math.max(current.maxY, Math.abs(event.clientY - current.startY));
        current.samples.push({ x: event.clientX, at: event.timeStamp });
        current.samples = current.samples.filter((sample) => event.timeStamp - sample.at <= 100);
    };

    /**
     * 松手位置与近期速度共同决定去留；反拉后的投影不能越过相反方向直接翻页。
     */
    const shouldCommit = (current: ReadingPointer, event: PointerEvent): boolean => {
        const first = current.samples[0];
        const velocity =
            first && event.timeStamp > first.at ? (event.clientX - first.x) / (event.timeStamp - first.at) : 0;
        const projected = current.offset + velocity * 150;
        return (
            Math.abs(current.offset) >= 12 &&
            Math.sign(projected) === Math.sign(current.offset) &&
            Math.abs(projected) >= current.width * 0.26
        );
    };

    // 正文之外的指针也参与多指判断；输入识别不依赖窗口宽度或主指针媒体查询。
    bind(
        document,
        "pointerdown",
        (event: PointerEvent) => {
            activePointers.add(event.pointerId);
            if (!event.isPrimary || activePointers.size !== 1 || event.button !== 0) {
                cancel();
                return;
            }
            if (
                !handlers.isEnabled() ||
                !isReadingGestureTarget(event.target, content) ||
                hasSelection() ||
                hasNestedScroll(event.target, content, "x") ||
                hasNestedScroll(event.target, content, "y")
            )
                return;
            const viewport = window.visualViewport;
            const viewportLeft = viewport?.offsetLeft ?? 0;
            const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
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
                width: content.getBoundingClientRect().width,
                // 屏幕最边缘的滑动让给浏览器返回/前进；轻点仍使用正文自己的窄翻页区域。
                systemEdge: event.clientX < viewportLeft + 32 || event.clientX > viewportRight - 32,
                phase: "pending",
                offset: 0,
                samples: [{ x: event.clientX, at: event.timeStamp }],
            };
        },
        { signal }
    );

    // 水平意图成立后才准备页面并捕获真实正文节点；鼠标移动始终保留原生选字。
    bind(
        document,
        "pointermove",
        (event: PointerEvent) => {
            const current = pointer;
            if (current?.id !== event.pointerId) return;
            recordMovement(current, event);
            if (!handlers.isEnabled() || handlers.getMode() !== current.mode || hasSelection()) {
                cancel();
                return;
            }
            if (current.type === "mouse" || current.mode === "scroll") return;
            // 先确定输入轴；拖回起点时仍沿用全程水平范围，不能重新变成轻点。
            if (current.maxY >= 8 && current.maxY > current.maxX * Math.tan(Math.PI / 6)) {
                cancel();
                return;
            }
            if (current.phase === "pending") {
                if (current.maxX < 8) return;
                if (current.systemEdge) {
                    cancel();
                    return;
                }
                if (current.mode === "none") current.phase = "swipe";
                else if (handlers.onDragStart()) {
                    current.phase = "drag";
                    content.setPointerCapture(current.id);
                } else {
                    // 忙碌等原因拒绝的拖动不在随后松手时作用于另一页。
                    cancel();
                    return;
                }
            }
            event.preventDefault();
            if (current.phase === "drag") handlers.onDragMove(current.offset);
        },
        { passive: false, signal }
    );

    // 预览准备可以程序滚动正文视窗；原生纵向接管会派发 pointercancel，不能误杀预览自身。
    bind(
        content,
        "scroll",
        (event: Event) => {
            if (!pointer) return;
            const target = event.target;
            if (
                pointer.phase === "drag" &&
                (target === content || (target instanceof HTMLElement && target.classList.contains("reading-viewport")))
            )
                return;
            cancel();
        },
        { passive: true, capture: true, signal }
    );
    bind(
        content,
        "lostpointercapture",
        (event: PointerEvent) => {
            // 触摸从原始段落的隐式捕获转交到 content 时，也会有一次冒泡的 lost 事件。
            if (event.target === content && pointer?.id === event.pointerId && pointer.phase === "drag") cancel();
        },
        { signal }
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
            recordMovement(current, event);
            if (
                !event.isPrimary ||
                event.button !== 0 ||
                activePointers.size > 0 ||
                !handlers.isEnabled() ||
                handlers.getMode() !== current.mode ||
                hasSelection()
            ) {
                cancel();
                return;
            }
            pointer = undefined;
            if (content.hasPointerCapture(current.id)) content.releasePointerCapture(current.id);
            if (current.phase === "drag") {
                handlers.onDragMove(current.offset);
                await handlers.onDragEnd(shouldCommit(current, event));
                return;
            }
            let direction = ReadingDirection.INVALID;
            if (current.phase === "swipe") {
                const bounds = content.getBoundingClientRect();
                if (
                    shouldCommit(current, event) &&
                    isReadingGestureTarget(event.target, content) &&
                    event.clientX >= bounds.left &&
                    event.clientX <= bounds.right &&
                    event.clientY >= bounds.top &&
                    event.clientY <= bounds.bottom
                )
                    direction = current.offset > 0 ? ReadingDirection.PREV : ReadingDirection.NEXT;
            } else direction = readTap(current, event);
            if (direction !== ReadingDirection.INVALID) await handlers.onTurn(direction);
        },
        { signal }
    );

    // 连续滚动保持原生行为；分页把一次滚轮或触控板输入及其惯性作为一次翻页。
    bind(
        content,
        "wheel",
        async (event: WheelEvent) => {
            if (pointer) cancel();
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
                activePointers.clear();
                cancel();
            });
        },
        { signal }
    );
    window.addEventListener(
        "resize",
        () => {
            run(cancel);
        },
        { signal }
    );
    bind(
        document,
        "visibilitychange",
        () => {
            if (document.visibilityState !== "hidden") return;
            activePointers.clear();
            cancel();
        },
        { signal }
    );

    signal.addEventListener(
        "abort",
        () => {
            run(() => {
                activePointers.clear();
                cancel();
            });
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
        !target.closest("button, a, input, textarea, select, summary, [contenteditable], [role=dialog]")
    );
}

/**
 * 表格与代码块保留自身的选择和触摸，即使当前没有溢出也不成为翻页触区。
 */
function isReadingGestureTarget(target: EventTarget | null, content: HTMLElement): boolean {
    return isReadingTarget(target, content) && target instanceof HTMLElement && !target.closest("table, pre");
}

/**
 * 已有选区的清除以及正在创建的选区都不能误触阅读手势。
 */
function hasSelection(): boolean {
    const selection = window.getSelection();
    return selection !== null && !selection.isCollapsed;
}
