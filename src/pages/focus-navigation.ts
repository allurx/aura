/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 仅在键盘导航时显示焦点提示，避免原生弹窗或程序恢复继承触摸前的焦点描边。
 * 输入方式跨页面保留；只清理监听，不清除实际焦点或控件的选中状态。
 */
export function bindFocusNavigation(signal: AbortSignal): void {
    const root = document.documentElement;
    const navigationKeys = new Set([
        "Tab",
        "Escape",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
        "Enter",
        " ",
    ]);

    document.addEventListener(
        "keydown",
        (event) => {
            if (event.isComposing || !navigationKeys.has(event.key)) return;
            // 文本编辑中的空格、回车和光标移动也可能来自手机软键盘，不视为焦点导航。
            const target = event.target;
            if (
                event.key !== "Tab" &&
                event.key !== "Escape" &&
                target instanceof HTMLElement &&
                (target.isContentEditable || target.matches('input[type="search"], input[type="text"], textarea'))
            )
                return;
            root.setAttribute("data-keyboard-navigation", "");
        },
        { capture: true, signal }
    );
    document.addEventListener(
        "pointerdown",
        () => {
            root.removeAttribute("data-keyboard-navigation");
        },
        { capture: true, signal }
    );
}
