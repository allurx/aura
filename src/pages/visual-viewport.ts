/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 搜索键盘遮挡布局视口时，页面和顶层浮层共用剩余可见高度与偏移。
 * 常态由 CSS 管理完整画布，避免主屏幕的安全区差值缩短页面。
 * 双指缩放沿用浏览器的平移和缩放，不把放大后的视口重新排版成小屏。
 */
export function bindVisualViewport(signal: AbortSignal): void {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let adjustingViewport = false;
    const clear = (): void => {
        adjustingViewport = false;
        root.style.removeProperty("--viewport-height");
        root.style.removeProperty("--viewport-top");
        root.style.removeProperty("--viewport-bottom");
    };
    const sync = (): void => {
        const focused = document.activeElement;
        const searching = focused instanceof HTMLInputElement && focused.type === "search" && !focused.readOnly;
        if (viewport.scale !== 1 || viewport.height >= root.clientHeight - 1) {
            clear();
            return;
        }
        // 点击关闭或选章会先使搜索框失焦；等键盘实际收起再恢复画布，避免按钮中途移位。
        if (!searching && !adjustingViewport) return;
        adjustingViewport = true;
        root.style.setProperty("--viewport-height", `${String(viewport.height)}px`);
        root.style.setProperty("--viewport-top", `${String(viewport.offsetTop)}px`);
        root.style.setProperty(
            "--viewport-bottom",
            `${String(Math.max(0, innerHeight - viewport.height - viewport.offsetTop))}px`
        );
    };

    viewport.addEventListener("resize", sync, { signal });
    viewport.addEventListener("scroll", sync, { signal });
    window.addEventListener("resize", sync, { signal });
    // 输入间移动焦点时，等当前事件链结束再读取新的 activeElement。
    const syncFocus = (): void => {
        queueMicrotask(() => {
            if (!signal.aborted) sync();
        });
    };
    document.addEventListener("focusin", syncFocus, { signal });
    document.addEventListener("focusout", syncFocus, { signal });
    signal.addEventListener("abort", clear, { once: true });
    sync();
}
