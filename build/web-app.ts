/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HtmlTagDescriptor, Plugin } from "vite";

/**
 * Web 安装和公开站点元信息；portable 不注册此插件。
 */
export function webAppPlugin(): Plugin {
    return {
        name: "aura:web-app",
        transformIndexHtml: {
            order: "post",
            /**
             * 标签放在 head 尾部，保留字符集声明在文档开头的位置。
             */
            handler(): HtmlTagDescriptor[] {
                const siteUrl = "https://aura.allurx.io/";
                const shareTitle = "Aura · 轻量的本地电子书阅读器";
                const shareDescription =
                    "导入 TXT 和 EPUB，整理自己的书架，接着上次的位置阅读。无需账户，书籍与阅读进度保存在当前浏览器中。";
                const shareImage = new URL("icons/app-512.png", siteUrl).href;
                const shareImageAlt = "Aura 彩虹书标识";

                return [
                    {
                        tag: "link",
                        attrs: { rel: "manifest", href: "/manifest.webmanifest" },
                        injectTo: "head",
                    },
                    {
                        tag: "link",
                        attrs: {
                            rel: "apple-touch-icon",
                            href: "/icons/apple-touch-icon.png",
                            sizes: "180x180",
                        },
                        injectTo: "head",
                    },
                    {
                        tag: "meta",
                        attrs: { name: "apple-mobile-web-app-title", content: "Aura" },
                        injectTo: "head",
                    },
                    {
                        tag: "meta",
                        attrs: { name: "apple-mobile-web-app-capable", content: "yes" },
                        injectTo: "head",
                    },
                    {
                        tag: "meta",
                        attrs: { name: "mobile-web-app-capable", content: "yes" },
                        injectTo: "head",
                    },
                    {
                        tag: "meta",
                        attrs: { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
                        injectTo: "head",
                    },
                    {
                        tag: "link",
                        attrs: { rel: "canonical", href: siteUrl },
                        injectTo: "head",
                    },
                    {
                        tag: "meta",
                        attrs: { name: "baidu-site-verification", content: "codeva-BPm6QSCSHM" },
                        injectTo: "head",
                    },
                    ...[
                        ["og:type", "website"],
                        ["og:site_name", "Aura"],
                        ["og:locale", "zh_CN"],
                        ["og:title", shareTitle],
                        ["og:description", shareDescription],
                        ["og:url", siteUrl],
                        ["og:image", shareImage],
                        ["og:image:type", "image/png"],
                        ["og:image:width", "512"],
                        ["og:image:height", "512"],
                        ["og:image:alt", shareImageAlt],
                    ].map(([property, content]): HtmlTagDescriptor => ({
                        tag: "meta",
                        attrs: { property, content },
                        injectTo: "head",
                    })),
                    ...[
                        ["twitter:card", "summary"],
                        ["twitter:title", shareTitle],
                        ["twitter:description", shareDescription],
                        ["twitter:image", shareImage],
                        ["twitter:image:alt", shareImageAlt],
                    ].map(([name, content]): HtmlTagDescriptor => ({
                        tag: "meta",
                        attrs: { name, content },
                        injectTo: "head",
                    })),
                    {
                        tag: "script",
                        attrs: { type: "application/ld+json" },
                        children: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "WebSite",
                            name: "Aura",
                            url: siteUrl,
                            inLanguage: "zh-CN",
                        }),
                        injectTo: "head",
                    },
                ];
            },
        },
    };
}
