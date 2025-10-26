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

import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";
import { defineConfig } from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { join, dirname } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";

/**
 * vite配置
 * @author allurx
 */
export default defineConfig({
    root: "src/page",
    build: {
        target: "ES2022",
        outDir: `${__dirname}/dist`,
        emptyOutDir: true,
        // https://cn.rollupjs.org/configuration-options
        rollupOptions: {
            input: {
                bookshelf: "/bookshelf/bookshelf.html",
                reader: "/reader/reader.html",
            },
            output: {
                entryFileNames: "assets/js/[hash].js",
                chunkFileNames: "assets/js/[hash].js",
                assetFileNames: (assetInfo) => {
                    const name = assetInfo.name ?? "";
                    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
                    if (ext === ".css") return "assets/css/[hash][extname]";
                    if (/\.(png|jpe?g|gif|svg|webp|avif)$/.test(ext)) return "assets/img/[hash][extname]";
                    if (/\.(woff2?|ttf|otf|eot)$/.test(ext)) return "assets/fonts/[hash][extname]";
                    return "assets/[hash][extname]";
                }
            }
        },
        minify: "esbuild",
        assetsInlineLimit: 0
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
                renameGlobals: false
            }
        }),
        // html插件,移除注释和空白
        createHtmlPlugin({
            minify: {
                collapseWhitespace: true,
                removeComments: true
            }
        }),
        // 生成Cloudflare Pages重定向文件插件
        createRedirectsPlugin()
    ]
});

/**
 * 生成重定向文件插件
 * 用于Cloudflare Pages将根路径重定向到/bookshelf/bookshelf.html
 */
function createRedirectsPlugin() {
    return {
        name: "generate-redirects",
        closeBundle() {
            // 获取dist路径
            const __dirname = dirname(fileURLToPath(import.meta.url));
            const redirectsPath = join(__dirname, "dist", "_redirects");

            // 确保 dist 存在
            mkdirSync(dirname(redirectsPath), { recursive: true });

            // 写入Cloudflare Pages的重定向规则
            const content = "/    /bookshelf/bookshelf.html    200\n";
            writeFileSync(redirectsPath, content);
        }
    }
}