/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { defineConfig, mergeConfig, type UserConfig } from "vite";
import baseConfig from "@allurx/js-config/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { webAppPlugin } from "./build/web-app.ts";
import { licensePlugin } from "./build/licenses.ts";
import { portableEntryPlugin } from "./build/portable.ts";
import packageJson from "./package.json" with { type: "json" };

const PROJECT_ROOT = import.meta.dirname;
const SOURCE_ROOT = resolve(PROJECT_ROOT, "src");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif"]);
const FONT_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf", ".eot"]);

export default defineConfig(({ command, mode, isPreview }) => {
    // Web 与 portable 分别写入独立目录。
    const portable = mode === "portable";
    const development = command === "serve" && !isPreview;
    const outputDirectory = portable ? "portable" : "web";

    return mergeConfig(baseConfig, {
        // Hash Router 继续由单一入口处理导航。
        appType: "spa",
        // portable 内联资源并使用相对路径，Web 版按站点根路径部署。
        root: SOURCE_ROOT,
        base: portable ? "./" : "/",
        publicDir: portable ? false : "public",
        resolve: {
            alias: {
                "@": SOURCE_ROOT,
            },
        },

        // 开发时电脑与局域网手机共用 HTTPS 和热更新；构建与预览不读取本机证书。
        ...(development
            ? {
                  server: {
                      host: "0.0.0.0",
                      port: 5173,
                      strictPort: true,
                      https: {
                          key: readFileSync(resolve(PROJECT_ROOT, ".certs/dev-key.pem")),
                          cert: readFileSync(resolve(PROJECT_ROOT, ".certs/dev.pem")),
                      },
                  },
              }
            : {}),

        // 单次构建只清理当前交付目录，其他版本的产物仍保留。
        build: {
            outDir: resolve(PROJECT_ROOT, "dist", outputDirectory),
            emptyOutDir: true,
            ...(portable ? { modulePreload: false } : {}),
            rolldownOptions: {
                output: {
                    // 生产构建统一移除调试输出。
                    minify: {
                        compress: {
                            dropConsole: true,
                            dropDebugger: true,
                        },
                    },
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

        // 按交付方式组合 HTML 声明与 portable 内联。
        plugins: [
            {
                name: "aura:version",
                /**
                 * 将当前程序版本写入页面，Web 与 portable 均可离线读取。
                 */
                transformIndexHtml(html) {
                    return html.replace("__AURA_VERSION__", packageJson.version);
                },
            },
            // 安装与公开站点元信息只用于 Web，portable 不引用这些外部资源。
            !portable && webAppPlugin(),
            portable && viteSingleFile(),
            portable && portableEntryPlugin(),
            licensePlugin(PROJECT_ROOT, portable),
        ],
    } satisfies UserConfig);
});
