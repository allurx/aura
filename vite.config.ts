/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";
import { viteSingleFile } from "vite-plugin-singlefile";

const PROJECT_ROOT = import.meta.dirname;
const SOURCE_ROOT = resolve(PROJECT_ROOT, "src");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif"]);
const FONT_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf", ".eot"]);

/**
 * vite配置
 */
export default defineConfig(({ command, mode, isPreview }) => {
    // 从构建模式推导交付组合，每种产物写入独立目录。
    const portable = mode === "portable" || mode === "portable-obfuscated";
    const obfuscated = mode === "obfuscated" || mode === "portable-obfuscated";
    const httpsDevelopment = command === "serve" && !isPreview && mode === "https";
    const outputDirectory = `${portable ? "portable" : "web"}${obfuscated ? "-obfuscated" : ""}`;

    return {
        // portable 内联资源并使用相对路径，Web 版按站点根路径部署。
        root: SOURCE_ROOT,
        base: portable ? "./" : "/",
        publicDir: portable ? false : "public",
        resolve: {
            alias: {
                "@": SOURCE_ROOT,
            },
        },

        // 默认 localhost HTTP 即可开发；显式选择 https 模式时才读取本机证书。
        ...(httpsDevelopment
            ? {
                  server: {
                      https: {
                          key: readFileSync(resolve(PROJECT_ROOT, "../localhost-key.pem")),
                          cert: readFileSync(resolve(PROJECT_ROOT, "../localhost.pem")),
                      },
                  },
              }
            : {}),

        // 生产构建统一移除调试输出。
        ...(command === "build"
            ? {
                  esbuild: {
                      drop: ["console", "debugger"],
                  },
              }
            : {}),

        // 单次构建只清理当前交付目录，其他版本的产物仍保留。
        build: {
            outDir: resolve(PROJECT_ROOT, "dist", outputDirectory),
            emptyOutDir: true,
            ...(portable ? { modulePreload: false } : {}),
            // https://cn.rollupjs.org/configuration-options
            rollupOptions: {
                output: {
                    entryFileNames: "assets/js/[name]-[hash].js",
                    chunkFileNames: "assets/js/[name]-[hash].js",
                    assetFileNames: (assetInfo) => {
                        const extension = extname(assetInfo.names[0] ?? "").toLowerCase();
                        if (extension === ".css") return "assets/css/[name]-[hash][extname]";
                        if (IMAGE_EXTENSIONS.has(extension)) return "assets/images/[name]-[hash][extname]";
                        if (FONT_EXTENSIONS.has(extension)) return "assets/fonts/[name]-[hash][extname]";
                        return "assets/[name]-[hash][extname]";
                    },
                },
            },
        },

        // 按交付方式组合 HTML 声明、混淆与 portable 内联。
        plugins: [
            // 开发服务器和 Web 构建共用安装声明，portable 不引用外部安装资源。
            !portable && {
                name: "aura:web-app",
                transformIndexHtml: {
                    order: "post",
                    /**
                     * 标签放在 head 尾部，保留字符集声明在文档开头的位置。
                     */
                    handler(): HtmlTagDescriptor[] {
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
                                tag: "link",
                                attrs: { rel: "canonical", href: "https://aura.allurx.io/" },
                                injectTo: "head",
                            },
                        ];
                    },
                },
            },
            // https://github.com/elmeet/vite-plugin-javascript-obfuscator
            obfuscated &&
                obfuscatorPlugin({
                    apply: "build",
                    options: {
                        compact: true,
                        identifierNamesGenerator: "mangled",
                        renameGlobals: false,
                        // 固定种子使相同源码产生相同内容哈希，保证构建可复现并保留长期缓存。
                        seed: 0x41555241,
                        sourceMap: false,
                        stringArray: true,
                        stringArrayThreshold: 0.5,
                    },
                }),
            portable && viteSingleFile(),
            portable && portableEntryPlugin(),
            licensePlugin(portable),
        ],
    };
});

/**
 * 许可维护源只保存一份；所有页面内嵌全文，Web 另提供随产物分发的文本文件。
 */
function licensePlugin(portable: boolean): Plugin {
    const documents = [
        { fileName: "LICENSE.txt", placeholder: "__AURA_LICENSE_TEXT__" },
        { fileName: "THIRD-PARTY-NOTICES.txt", placeholder: "__AURA_THIRD_PARTY_NOTICES__" },
    ].map((document) => {
        const text = readFileSync(resolve(PROJECT_ROOT, document.fileName), "utf8");
        if (!text.trim()) throw new Error(`License document is empty: ${document.fileName}`);
        const thirdParty = document.fileName === "THIRD-PARTY-NOTICES.txt";
        const parts = thirdParty ? text.split(/(?=^--- .+ ---\r?$)/m) : [text];
        return {
            ...document,
            text,
            parts: parts.map(escapeHtml),
            html: thirdParty ? renderThirdPartyLicenses(parts) : escapeHtml(text),
        };
    });

    return {
        name: "aura:licenses",
        transformIndexHtml: {
            order: "pre",
            /**
             * 开发页和生产构建使用相同许可正文。
             */
            handler(html) {
                for (const document of documents) {
                    if (!html.includes(document.placeholder)) {
                        throw new Error(`License placeholder is missing: ${document.fileName}`);
                    }
                    html = html.replace(document.placeholder, () => document.html);
                }
                return html;
            },
        },
        generateBundle: {
            order: "post",
            /**
             * 内联与混淆结束后核对全文，避免构建成功却遗漏许可；portable 不产生伴随文件。
             */
            handler(_options, bundle) {
                const entry = bundle[portable ? "aura.html" : "index.html"];
                if (entry?.type !== "asset") throw new Error("Licensed HTML entry was not generated");
                const html = typeof entry.source === "string" ? entry.source : new TextDecoder().decode(entry.source);
                for (const document of documents) {
                    if (!document.parts.every((part) => html.includes(part))) {
                        throw new Error(`Built HTML is missing license text: ${document.fileName}`);
                    }
                    if (!portable) this.emitFile({ type: "asset", fileName: document.fileName, source: document.text });
                }
            },
        },
    };
}

/**
 * 从同一份声明生成名称、版本和来源概览；每段原文只嵌入一次，按需展开。
 */
function renderThirdPartyLicenses(parts: string[]): string {
    const [preamble, ...components] = parts;
    if (preamble === undefined || components.length === 0) throw new Error("Third-party notice sections are missing");

    const items = components.map((text) => {
        const heading = /^--- (.+?) (\d+\.\d+\.\d+)[^\r\n]* ---\r?$/m.exec(text);
        const source = /^Source: (https:\/\/\S+)\r?$/m.exec(text)?.[1];
        const license = /^License: ([\w.-]+)\r?$/m.exec(text)?.[1];
        const name = heading?.[1];
        const version = heading?.[2];
        if (!name || !version || !source || !license) throw new Error("Third-party notice metadata is incomplete");

        const sourceUrl = new URL(source).href;
        const licenseUrl = `https://spdx.org/licenses/${encodeURIComponent(license)}.html`;
        return `<li class="license-item">
            <div class="license-item-heading">
                <a class="license-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="查看 ${escapeHtml(name)} ${escapeHtml(version)} 项目（新窗口）">
                    <span>${escapeHtml(name)}</span><span class="license-version">${escapeHtml(version)}</span>
                    <span class="icon icon-external-link" aria-hidden="true"></span>
                </a>
                <a class="license-badge" href="${licenseUrl}" target="_blank" rel="noopener noreferrer" aria-label="查看 ${escapeHtml(license)} 官方许可证（新窗口）">${escapeHtml(license)}</a>
            </div>
            <details class="license-disclosure">
                <summary>版权与许可<span class="icon icon-chevron" aria-hidden="true"></span></summary>
                <pre data-notice-part>${escapeHtml(text)}</pre>
            </details>
        </li>`;
    });

    return `<pre data-notice-part hidden>${escapeHtml(preamble)}</pre><ul class="license-list">${items.join("")}</ul>`;
}

/**
 * 声明原文和来源字段只作为文本或属性值使用，不允许成为 HTML 结构。
 */
function escapeHtml(text: string): string {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * 在产物仍位于 Rollup 内存模型时重命名便携版入口，避免构建完成后再直接操作文件系统。
 */
function portableEntryPlugin(): Plugin {
    return {
        name: "aura:portable-entry",
        apply: "build",
        generateBundle: {
            order: "post",
            /**
             * 内联完成后将标准 HTML 入口替换为便携版文件名。
             */
            handler(_options, bundle) {
                const entry = bundle["index.html"];
                if (entry?.type !== "asset") throw new Error("Portable HTML entry was not generated");

                delete bundle["index.html"];
                entry.fileName = "aura.html";
                bundle[entry.fileName] = entry;
            },
        },
    };
}
