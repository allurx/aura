/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "./event-util";

/**
 * 触摸或触笔在按钮外松手、拖动或取消后，不接受浏览器按原始落点合成的点击。
 * 保留原生滚动与点击激活，键盘和辅助技术不依赖指针状态。
 */
export function bindButtonActivation(signal: AbortSignal): void {
    let press:
        { id: number; button: HTMLButtonElement; startX: number; startY: number; cancelled: boolean } | undefined;
    let cancelledClick: HTMLButtonElement | undefined;

    // 在文档上观察结束和多指输入；隐式捕获不能证明松手仍落在按钮内。
    bind(
        document,
        "pointerdown",
        (event) => {
            cancelledClick = undefined;
            if (press) {
                press.cancelled = true;
                return;
            }
            if (
                (event.pointerType !== "touch" && event.pointerType !== "pen") ||
                !event.isPrimary ||
                event.button !== 0 ||
                !(event.target instanceof Element)
            )
                return;
            const button = event.target.closest("button");
            if (!button) return;
            press = { id: event.pointerId, button, startX: event.clientX, startY: event.clientY, cancelled: false };
        },
        { capture: true, passive: true, signal }
    );
    bind(
        document,
        "pointermove",
        (event) => {
            if (press?.id !== event.pointerId) return;
            if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) >= 8) press.cancelled = true;
        },
        { capture: true, passive: true, signal }
    );
    bind(
        document,
        "pointerup",
        (event) => {
            if (press?.id !== event.pointerId) return;
            const target = document.elementFromPoint(event.clientX, event.clientY);
            const moved = Math.hypot(event.clientX - press.startX, event.clientY - press.startY) >= 8;
            cancelledClick = press.cancelled || moved || !press.button.contains(target) ? press.button : undefined;
            press = undefined;
        },
        { capture: true, passive: true, signal }
    );
    bind(
        document,
        "pointercancel",
        (event) => {
            if (press?.id !== event.pointerId) return;
            cancelledClick = press.button;
            press = undefined;
        },
        { capture: true, passive: true, signal }
    );
    window.addEventListener(
        "blur",
        () => {
            press = undefined;
            cancelledClick = undefined;
        },
        { signal }
    );

    // 同时阻止事件委托与原生 command/popover 激活，避免菜单和阅读入口表现不同。
    bind(
        document,
        "click",
        (event) => {
            if (event.detail === 0) return;
            const button = cancelledClick;
            cancelledClick = undefined;
            if (!(event.target instanceof Node) || !button?.contains(event.target)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        },
        { capture: true, signal }
    );
}
