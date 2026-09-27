/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
 * @author allurx
 */
export default defineConfig(({ command, mode, isPreview }) => {
    // 从构建模式推导交付组合，每种产物写入独立目录。
    const portable = mode === "portable" || mode === "portable-obfuscated";
    const obfuscated = mode === "obfuscated" || mode === "portable-obfuscated";
    const developmentServer = command === "serve" && !isPreview;
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

        // 仅开发服务器读取本机证书，构建与预览不依赖证书文件。
        ...(developmentServer
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
        ],
    };
});

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
