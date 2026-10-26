/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 搜索键盘遮挡布局视口时，搜索区域和顶层浮层共用剩余可见高度与偏移。
 * 页面画布仍由 CSS 管理正常尺寸，键盘避让不改变底层阅读排版。
 * 双指缩放沿用浏览器的平移和缩放，不把放大后的视口重新排版成小屏。
 */
export function bindVisualViewport(signal: AbortSignal): void {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let adjustingViewport = false;
    let frame: number | null = null;
    const clear = (): void => {
        adjustingViewport = false;
        root.removeAttribute("data-search-keyboard");
        root.style.removeProperty("--viewport-height");
        root.style.removeProperty("--viewport-top");
        root.style.removeProperty("--viewport-bottom");
    };
    const sync = (): void => {
        const focused = document.activeElement;
        const searching = focused instanceof HTMLInputElement && focused.type === "search" && !focused.readOnly;
        if (!searching && !adjustingViewport) return;

        // 先读取完整几何，再写入样式，避免重排后的视口值混入同一次更新。
        const { height, offsetTop, scale } = viewport;
        const layoutHeight = root.clientHeight;
        const windowHeight = window.innerHeight;
        if (scale !== 1 || height >= layoutHeight - 1) {
            clear();
            return;
        }

        // 点击关闭或选章会先使搜索框失焦；等键盘实际收起再恢复搜索区域和浮层，避免按钮中途移位。
        adjustingViewport = true;
        root.toggleAttribute("data-search-keyboard", true);
        root.style.setProperty("--viewport-height", `${String(height)}px`);
        root.style.setProperty("--viewport-top", `${String(offsetTop)}px`);
        root.style.setProperty("--viewport-bottom", `${String(Math.max(0, windowHeight - height - offsetTop))}px`);
    };
    const scheduleSync = (): void => {
        frame ??= requestAnimationFrame(() => {
            frame = null;
            sync();
        });
    };

    // 原生页面平移与可视视口事件可能连续触发，共用一帧内的最终几何。
    viewport.addEventListener("resize", scheduleSync, { signal });
    viewport.addEventListener("scroll", scheduleSync, { signal });
    window.addEventListener("resize", scheduleSync, { signal });
    window.addEventListener("scroll", scheduleSync, { signal });
    // 同一帧内的焦点交接完成后，再按最终输入和键盘状态更新。
    document.addEventListener("focusin", scheduleSync, { signal });
    document.addEventListener("focusout", scheduleSync, { signal });
    signal.addEventListener(
        "abort",
        () => {
            if (frame !== null) cancelAnimationFrame(frame);
            clear();
        },
        { once: true }
    );
    sync();
}
