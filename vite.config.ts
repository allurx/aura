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
import { viteSingleFile } from "vite-plugin-singlefile";
import { join, dirname } from "path";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";

/**
 * vite配置
 * @author allurx
 */
export default defineConfig(({ mode }) => {
    const portable = mode === "portable";

    return {
        root: "src",
        base: "./",
        server: {
            https: {
                key: readFileSync("../localhost-key.pem"),
                cert: readFileSync("../localhost.pem"),
            },
        },
        build: {
            target: "ESNext",
            outDir: portable ? "../dist-portable" : "../dist",
            emptyOutDir: true,
            // https://cn.rollupjs.org/configuration-options
            rollupOptions: {
                input: "src/index.html",
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
            // https://github.com/vbenjs/vite-plugin-html
            createHtmlPlugin({
                minify: {
                    collapseWhitespace: true,
                    removeComments: true,
                },
            }),
            ...(portable ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
            {
                name: "finalize-build",
                apply: "build",
                closeBundle() {
                    if (portable) {
                        renameSync(
                            join(__dirname, "dist-portable", "index.html"),
                            join(__dirname, "dist-portable", "aura.html")
                        );
                        return;
                    }

                    const redirectsPath = join(__dirname, "dist", "_redirects");
                    mkdirSync(dirname(redirectsPath), { recursive: true });
                    writeFileSync(redirectsPath, "/    /index.html    200\n");
                },
            },
        ],
    };
});
