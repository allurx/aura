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
import { defineConfig, type Plugin } from "vite";
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
    const portable = mode === "portable" || mode === "portable-obfuscated";
    const obfuscated = mode === "obfuscated" || mode === "portable-obfuscated";
    const developmentServer = command === "serve" && !isPreview;
    const outputDirectory = `dist${portable ? "-portable" : ""}${obfuscated ? "-obfuscated" : ""}`;

    return {
        root: SOURCE_ROOT,
        base: portable ? "./" : "/",
        publicDir: portable ? false : "public",
        resolve: {
            alias: {
                "@": SOURCE_ROOT,
            },
        },
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
        ...(command === "build"
            ? {
                  esbuild: {
                      drop: ["console", "debugger"],
                  },
              }
            : {}),
        build: {
            outDir: resolve(PROJECT_ROOT, outputDirectory),
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
        plugins: [
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
