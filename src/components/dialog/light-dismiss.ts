/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "@/utils/event-util";

/**
 * 为辅助模态面板启用外点关闭；取消请求仍由调用方的 cancel 监听器处理。
 * 支持 closedBy 时使用原生行为，其余浏览器只接受完整发生在遮罩上的单指点击。
 */
export default function enableLightDismiss(dialog: HTMLDialogElement, signal: AbortSignal): void {
    dialog.setAttribute("closedby", "any");
    if ("closedBy" in HTMLDialogElement.prototype) return;

    const pointers = new Set<number>();
    let backdropPointer: number | undefined;
    let backdropClick = false;

    // 区分 dialog 自身的内侧空白与原生 backdrop，避免内部拖出也被视为外点。
    const isBackdrop = (event: MouseEvent): boolean => {
        if (event.target !== dialog || !dialog.matches(":modal")) return false;
        const bounds = dialog.getBoundingClientRect();
        return (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
        );
    };

    bind(
        dialog,
        "pointerdown",
        (event: PointerEvent) => {
            if (!dialog.matches(":modal")) return;
            pointers.add(event.pointerId);
            backdropClick = false;
            backdropPointer =
                pointers.size === 1 && event.isPrimary && event.button === 0 && isBackdrop(event)
                    ? event.pointerId
                    : undefined;
        },
        { capture: true, signal }
    );
    bind(
        dialog,
        "pointerup",
        (event: PointerEvent) => {
            pointers.delete(event.pointerId);
            backdropClick =
                pointers.size === 0 && event.pointerId === backdropPointer && event.button === 0 && isBackdrop(event);
            backdropPointer = undefined;
        },
        { capture: true, signal }
    );
    bind(
        dialog,
        "pointercancel",
        (event: PointerEvent) => {
            pointers.delete(event.pointerId);
            backdropPointer = undefined;
            backdropClick = false;
        },
        { capture: true, signal }
    );

    // 等点击完成后再关闭，防止同一次点击落到关闭后露出的页面。
    bind(
        dialog,
        "click",
        (event: MouseEvent) => {
            const dismiss = backdropClick && isBackdrop(event);
            backdropClick = false;
            if (!dismiss) return;
            event.stopPropagation();
            if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
        },
        { signal }
    );
    bind(
        dialog,
        "close",
        () => {
            pointers.clear();
            backdropPointer = undefined;
            backdropClick = false;
        },
        { signal }
    );
}
