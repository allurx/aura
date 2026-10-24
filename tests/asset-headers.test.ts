/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "vite";
import { assetHeadersPlugin } from "../build/asset-headers.ts";

void test("Web cache rules follow the current JS and CSS outputs across builds", async (context) => {
    const root = await mkdtemp(join(tmpdir(), "aura-asset-headers-"));
    context.after(async () => {
        await rm(root, { recursive: true, force: true });
    });

    await writeFile(join(root, "index.html"), '<script type="module" src="/main.js"></script>');
    await writeFile(join(root, "main.js"), 'import "./style.css"; window.loadChapter = () => import("./chapter.js");');
    let previousPaths: string[] = [];

    // 实际生成 CSS 和异步代码分块，保护生成时机与跨构建路径更新，而非手工伪造 bundle。
    for (const version of [1, 2]) {
        await writeFile(join(root, "chapter.js"), `export const chapter = ${String(version)};`);
        await writeFile(join(root, "style.css"), `body { padding: ${String(version)}px; }`);
        const result = await build({
            configFile: false,
            root,
            publicDir: false,
            logLevel: "silent",
            plugins: [assetHeadersPlugin()],
            build: {
                write: false,
                sourcemap: true,
                rolldownOptions: {
                    output: {
                        entryFileNames: "assets/js/[name]-[hash].js",
                        chunkFileNames: "assets/js/[name]-[hash].js",
                        assetFileNames: "assets/css/[name]-[hash][extname]",
                    },
                },
            },
        });
        assert(!Array.isArray(result) && "output" in result);
        const headerAsset = result.output.find((file) => file.fileName === "_headers");
        assert(headerAsset?.type === "asset" && typeof headerAsset.source === "string");
        const headers = headerAsset.source;
        const paths = result.output
            .filter((file) => /\.(?:js|css)$/.test(file.fileName))
            .map((file) => `/${file.fileName}`)
            .sort();
        assert.equal(paths.length, 3, "Expected an entry, an async chunk and a stylesheet");

        // 精确规则必须对应且仅对应本次产物；基础 no-store 必须先于长期缓存例外。
        assert.deepEqual(headers.match(/^\/assets\/(?!\*)\S+$/gm)?.sort(), paths);
        assert.match(headers, /\/assets\/\*\r?\n {2}Cache-Control: no-store/);
        for (const path of paths) {
            const rule = `${path}\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable`;
            assert(headers.includes(rule), `Missing exact cache rule for ${path}`);
            assert(headers.indexOf("/assets/*") < headers.indexOf(path));
        }
        assert(!headers.includes(".js.map"), "Source maps must not inherit long caching");
        for (const path of previousPaths) assert(!headers.includes(path), `Stale cache rule: ${path}`);
        previousPaths = paths;
    }
});
