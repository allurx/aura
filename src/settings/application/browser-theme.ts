/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

// 页面切换、主题与显式背景可能在同一轮一起应用，只读取自然布局后的最终颜色。
const observer = new ResizeObserver(() => {
    observer.disconnect();
    const root = document.documentElement;
    const page = root.dataset["page"] === "reader" ? document.querySelector<HTMLElement>("#reader") : root;
    const background = getComputedStyle(page ?? root).backgroundColor;

    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement("meta");
        meta.name = "theme-color";
        document.head.append(meta);
    }
    if (meta.content !== background) meta.content = background;
});

/**
 * 为浏览器同步当前页面的实际背景，阅读背景的显式设置优先于主题。
 * 明暗模式由根元素的 CSS color-scheme 统一管理，不重复写入会使全页样式失效的元信息。
 */
export function syncBrowserTheme(): void {
    observer.observe(document.documentElement);
}
