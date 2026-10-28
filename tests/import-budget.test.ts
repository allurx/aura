/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { File } from "node:buffer";
import { after, before, test } from "node:test";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import type { BookImportResult } from "../src/pages/bookshelf/bookshelf-service.ts";

let importBooks: (files: File[], categoryId: string) => Promise<BookImportResult>;
let moduleDirectory: string | undefined;
let modulePath: string | undefined;

/**
 * 超过文件预算的虚拟输入；读取入口均抛错，不为前置拒绝测试实际分配数百 MiB。
 */
function oversizedFile(name = "oversized.epub") {
    return new (class extends File {
        public override readonly size = 257 * 1024 * 1024;
        public readonly webkitRelativePath = "";

        public override arrayBuffer(): never {
            throw new Error("Oversized book must be rejected before arrayBuffer");
        }

        public override bytes(): never {
            throw new Error("Oversized book must be rejected before bytes");
        }

        public override slice(): never {
            throw new Error("Oversized book must be rejected before slice");
        }

        public override stream(): never {
            throw new Error("Oversized book must be rejected before stream");
        }
    })([], name);
}

/**
 * 用项目已有的 Vite 打包实际公开服务及路径别名，在 Node 中调用，不复制预算检查实现。
 */
before(async () => {
    const result = await build({
        configFile: false,
        root: resolve(import.meta.dirname, ".."),
        resolve: { alias: { "@": resolve(import.meta.dirname, "../src") } },
        ssr: { noExternal: true },
        build: {
            ssr: resolve(import.meta.dirname, "../src/pages/bookshelf/bookshelf-service.ts"),
            write: false,
            minify: false,
        },
    });
    assert.ok(!Array.isArray(result) && "output" in result);
    const entry = result.output.find((output) => output.type === "chunk" && output.isEntry);
    assert.ok(entry?.type === "chunk");
    // 依赖用 import.meta.url 创建 Node require，必须给打包模块真实的文件 URL。
    moduleDirectory = await mkdtemp(join(tmpdir(), "aura-import-test-"));
    modulePath = join(moduleDirectory, "bookshelf-service.mjs");
    await writeFile(modulePath, entry.code);
    const service: unknown = await import(pathToFileURL(modulePath).href);
    assert.ok(service && typeof service === "object" && "importBooks" in service);
    assert.equal(typeof service.importBooks, "function");
    importBooks = service.importBooks as typeof importBooks;
});

after(async () => {
    if (modulePath) await unlink(modulePath);
    if (moduleDirectory) await rmdir(moduleDirectory);
});

void test("超限 TXT 与 EPUB 在任何读取或数据库操作前按文件拒绝", async () => {
    const files = [oversizedFile(), oversizedFile("oversized.txt")];
    // 虚拟文件的所有读取入口都会抛错；Node 环境也没有 IndexedDB。
    const result = await importBooks(files, "collection");
    assert.equal(result.books.length, 0);
    assert.equal(result.rejectedFiles.length, 2);
    for (const [index, file] of files.entries()) {
        assert.equal(result.rejectedFiles[index]?.file, file);
        assert.match(result.rejectedFiles[index].reason, /256 MiB/);
    }
});

void test("后续文件读取失败仍保留已拒绝文件和准确的未完成范围", async () => {
    const rejected = oversizedFile();
    const readFailure = new Error("test file read failed");
    const unreadable = new File(["content"], "unreadable.txt");
    Object.defineProperty(unreadable, "arrayBuffer", {
        value: () => Promise.reject(readFailure),
    });

    await assert.rejects(importBooks([rejected, unreadable], "collection"), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.cause, readFailure);
        assert.ok("result" in error && "unfinishedFiles" in error);
        const result = error.result as BookImportResult;
        assert.equal(result.rejectedFiles[0]?.file, rejected);
        assert.deepEqual(error.unfinishedFiles, [unreadable]);
        return true;
    });
});
