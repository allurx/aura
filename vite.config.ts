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

import { defineConfig } from "vite";
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";
import { createHtmlPlugin } from "vite-plugin-html";
import { join, dirname } from "path";
import { writeFileSync, mkdirSync } from "fs";

/**
 * vite配置
 * @author allurx
 */
export default defineConfig({
    root: "src",
    build: {
        target: "ES2022",
        outDir: "../dist",
        emptyOutDir: true,
        // https://cn.rollupjs.org/configuration-options
        rollupOptions: {
            input: {
                bookshelf: "src/page/bookshelf/bookshelf.html",
                reader: "src/page/reader/reader.html",
            },
            output: {
                entryFileNames: "asset/js/[hash].js",
                chunkFileNames: "asset/js/[hash].js",
                assetFileNames: (assetInfo) => {
                    const name = assetInfo.names[0] ?? "";
                    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
                    if (ext === ".css") return "asset/css/[hash][extname]";
                    if (/\.(png|jpe?g|gif|svg|webp|avif)$/.test(ext)) return "asset/image/[hash][extname]";
                    if (/\.(woff2?|ttf|otf|eot)$/.test(ext)) return "asset/font/[hash][extname]";
                    return "asset/[hash][extname]";
                },
            },
        },
        minify: "esbuild",
        assetsInlineLimit: 0,
    },
    plugins: [
        // 代码混淆插件
        // https://github.com/elmeet/vite-plugin-javascript-obfuscator
        obfuscatorPlugin({
            apply: "build",
            options: {
                compact: true,
                disableConsoleOutput: true,
                selfDefending: true,
                sourceMap: false,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.4,
                stringArray: true,
                stringArrayThreshold: 0.5,
                deadCodeInjection: false,
                identifierNamesGenerator: "mangled",
                debugProtection: false,
                renameGlobals: false,
            },
        }),
        // html插件,移除注释和空白
        createHtmlPlugin({
            minify: {
                collapseWhitespace: true,
                removeComments: true,
            },
        }),
        /**
         * 在dist目录下生成_redirects文件
         * 用于Cloudflare Pages将根路径重定向到/bookshelf/bookshelf.html
         */
        {
            name: "generate-redirects",
            apply: "build",
            closeBundle() {
                const redirectsPath = join(__dirname, "dist", "_redirects");

                // 创建redirects文件所在目录
                mkdirSync(dirname(redirectsPath), { recursive: true });

                // 写入Cloudflare Pages的重定向规则
                const content = "/    /page/bookshelf/bookshelf.html    200\n";
                writeFileSync(redirectsPath, content);
            },
        },
    ],
});
