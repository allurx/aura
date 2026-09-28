/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 为浏览器提供当前页面的实际背景与明暗模式；阅读背景的显式设置优先于主题。
 * 页面初始化时创建元信息，后续主题及阅读背景变化复用相同节点。
 *
 */
export function syncBrowserTheme(): void {
    const root = document.documentElement;
    const page = root.dataset["page"] === "reader" ? document.querySelector<HTMLElement>("#reader") : root;
    const rootStyle = getComputedStyle(root);
    const background = getComputedStyle(page ?? root).backgroundColor;

    updateMeta("theme-color", background);
    updateMeta("color-scheme", rootStyle.colorScheme);
}

/**
 * 元信息由实际页面样式驱动，HTML 无需预置固定配色。
 */
function updateMeta(name: "theme-color" | "color-scheme", content: string): void {
    let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (!meta) {
        meta = document.createElement("meta");
        meta.name = name;
        document.head.append(meta);
    }
    meta.content = content;
}
