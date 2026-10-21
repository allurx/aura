/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, before, test } from "node:test";
import type { Page } from "playwright-core";
import {
    importBooks,
    openBook,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    waitForBookCount,
    withPage,
} from "./browser-test-support.ts";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";

before(startBrowserTests);
after(stopBrowserTests);

/**
 * 独立连接在事务完成后关闭；跨 store 核对失败导入没有留下孤立内容。
 */
async function readStoreCounts(page: Page): Promise<Record<string, number>> {
    return page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("aura");
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Unable to inspect the test database"));
            };
        });
        try {
            return await new Promise<Record<string, number>>((resolve, reject) => {
                const stores = ["book", "chapter", "file", "progress", "toc"];
                const transaction = database.transaction(stores, "readonly");
                const counts: Record<string, number> = {};
                for (const name of stores) {
                    const request = transaction.objectStore(name).count();
                    request.onsuccess = () => {
                        counts[name] = request.result;
                    };
                }
                transaction.oncomplete = () => {
                    resolve(counts);
                };
                transaction.onabort = () => {
                    reject(transaction.error ?? new Error("Unable to read test store counts"));
                };
            });
        } finally {
            database.close();
        }
    });
}

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: rejected EPUB content leaves no library records and makes no external request`, async () => {
        // 损坏真实 ZIP 中首个条目的中央目录 CRC；其余归档仍能被正常解析。
        const badCrc = createEpubFixture("<p>Checksum rejection</p>");
        const directoryOffset = badCrc.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        assert(directoryOffset >= 0);
        badCrc.writeUInt32LE((badCrc.readUInt32LE(directoryOffset + 16) ^ 1) >>> 0, directoryOffset + 16);
        const cases = [
            { name: "checksum", buffer: badCrc, reason: /校验失败/ },
            {
                name: "external-image",
                buffer: createEpubFixture('<p>Offline boundary</p><img src="https://example.invalid/aura-test.png"/>'),
                reason: /外部资源/,
            },
            {
                name: "deep-content",
                buffer: createEpubFixture("<div>".repeat(202) + "Nested content" + "</div>".repeat(202)),
                reason: /嵌套过深/,
            },
            {
                name: "oversized-empty-structure",
                buffer: createEpubFixture("<ol><li>正文</li>" + "<li></li>".repeat(10_000) + "</ol>"),
                reason: /空结构/,
            },
        ];
        for (const sample of cases) {
            await withPage(delivery, async (page) => {
                const externalRequests: string[] = [];
                page.on("request", (request) => {
                    if (request.url().startsWith("https://example.invalid/")) externalRequests.push(request.url());
                });
                await page.locator("#book-input").setInputFiles({
                    name: `${sample.name}.epub`,
                    mimeType: "application/epub+zip",
                    buffer: sample.buffer,
                });
                const result = page.getByRole("dialog", { name: "所选文件未能导入", exact: true });
                await result.waitFor();
                assert.match(await result.innerText(), sample.reason);
                await result.getByRole("button", { name: "知道了", exact: true }).click();
                await waitForBookCount(page, 0);
                assert.deepEqual(await readStoreCounts(page), { book: 0, chapter: 0, file: 0, progress: 0, toc: 0 });
                assert.deepEqual(externalRequests, []);
            });
        }
    });

    void test(`${delivery}: a failed book write rolls back new content and preserves existing books`, async () => {
        await withPage(
            delivery,
            async (page) => {
                const retained = textBook("retained.txt", 2);
                await importBooks(page, [retained]);
                const beforeFailure = await readStoreCounts(page);

                // 新文件、目录与章节已经写入同一事务，随后模拟书籍写入的存储故障。
                await page.evaluate(() => {
                    // eslint-disable-next-line @typescript-eslint/unbound-method -- 故障注入保留原方法，并在下方显式以当前 store 调用。
                    const add = IDBObjectStore.prototype.add;
                    IDBObjectStore.prototype.add = function (value: unknown, key?: IDBValidKey) {
                        if (this.name === "book") {
                            IDBObjectStore.prototype.add = add;
                            throw new DOMException("Test storage quota exceeded", "QuotaExceededError");
                        }
                        return key === undefined ? add.call(this, value) : add.call(this, value, key);
                    };
                });
                const interrupted = {
                    name: "interrupted.epub",
                    mimeType: "application/epub+zip",
                    buffer: createEpubFixture('<p>Interrupted new source</p><img src="pixel.png" alt="pixel"/>'),
                };
                await page.locator("#book-input").setInputFiles(interrupted);
                const result = page.getByRole("dialog", { name: "导入已中断", exact: true });
                await result.waitFor();
                assert.match(await result.innerText(), /interrupted\.epub/);
                assert.match(await result.innerText(), /存储空间不足/);
                await result.getByRole("button", { name: "知道了", exact: true }).click();
                await waitForBookCount(page, 1);
                assert.deepEqual(await readStoreCounts(page), beforeFailure);

                // 失败后重试同一文件应完成正常导入，原有书籍仍可阅读。
                await importBooks(page, [interrupted]);
                await openBook(page, retained.name);
                assert.match(await page.locator("#content").innerText(), /测试章节/);
            },
            ["导入已中断"]
        );
    });
}
