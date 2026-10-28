/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { unzipSync } from "fflate";
import type { Locator, Page } from "playwright-core";
import {
    importBooks,
    openBook,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    waitForBookCount,
    withPage,
    type BookUpload,
} from "./browser-test-support.ts";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";

before(startBrowserTests);
after(stopBrowserTests);

/**
 * 从管理入口打开实际操作窗口，范围选择和执行使用应用的原生控件。
 */
async function openBulkAction(page: Page, action: "export" | "clear"): Promise<Locator> {
    await page.locator("#open-more").click();
    await page.locator(action === "export" ? "#export-btn" : "#clear-btn").click();
    const dialog = page.getByRole("dialog", { name: action === "export" ? "导出原文件" : "清空书籍", exact: true });
    await dialog.waitFor();
    return dialog;
}

/**
 * 下载后解包并逐字节比较全部条目；重复内容仍须按书籍记录保留对应文件。
 */
async function assertArchive(page: Page, dialog: Locator, expected: readonly BookUpload[]): Promise<void> {
    const pending = page.waitForEvent("download");
    await dialog.locator(".confirm-btn").click();
    const download = await pending;
    assert.match(download.suggestedFilename(), /\.zip$/u);
    const path = await download.path();
    assert(path);
    const entries = unzipSync(await readFile(path));
    assert.equal(Object.keys(entries).length, expected.length);
    assert.deepEqual(
        Object.values(entries)
            .map((bytes) => Buffer.from(bytes).toString("hex"))
            .sort(),
        expected.map((file) => file.buffer.toString("hex")).sort()
    );
    for (const name of Object.keys(entries)) assert.doesNotMatch(name, /[\\/]/u);
    await page.locator(".overlay:not([hidden])").waitFor({ state: "hidden" });
}

/**
 * 直接核对小型测试书库的记录和外观；独立连接在完成后关闭。
 */
async function readLibrary(page: Page): Promise<{ stores: Record<string, unknown[]>; appearance: string | null }> {
    return page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("aura");
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Unable to inspect the test library"));
            };
        });
        try {
            const stores: Record<string, unknown[]> = {};
            for (const name of [...database.objectStoreNames]) {
                stores[name] = await new Promise<unknown[]>((resolve, reject) => {
                    const request = database.transaction(name, "readonly").objectStore(name).getAll();
                    request.onsuccess = () => {
                        resolve(request.result);
                    };
                    request.onerror = () => {
                        reject(request.error ?? new Error("Unable to read test records"));
                    };
                });
            }
            return { stores, appearance: localStorage.getItem("aura.bookshelf.appearance") };
        } finally {
            database.close();
        }
    });
}

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: scoped ZIP export preserves TXT and EPUB bytes, duplicates and the full selected scope`, async () => {
        await withPage(delivery, async (page) => {
            const sources = [
                {
                    name: "duplicate.txt",
                    mimeType: "text/plain",
                    buffer: Buffer.concat([
                        Buffer.from([0xff, 0xfe]),
                        Buffer.from("第一章 原文件\r\n完整保留 UTF-16 原始字节。\r\n", "utf16le"),
                    ]),
                },
                textBook("duplicate.txt", 2),
                textBook("duplicate (2).txt", 3),
                {
                    name: "original.epub",
                    mimeType: "application/epub+zip",
                    buffer: createEpubFixture('<p>保留原始 EPUB 归档。</p><img src="pixel.png" alt="图片"/>'),
                },
            ];
            await importBooks(page, sources);
            await page.locator('#category-navigation button[data-id="fiction"]').click();
            await waitForBookCount(page, 0);
            const firstSource = sources[0];
            assert(firstSource);
            const sharedCopy = { ...firstSource, name: "shared-copy.txt" };
            await importBooks(page, [sharedCopy]);

            // 搜索只显示三本 TXT，当前分类导出仍须包含未显示的 EPUB。
            await page.locator('#category-navigation button[data-id="collection"]').click();
            await page.locator("#book-search").fill("duplicate");
            await waitForBookCount(page, 3);
            const beforeExport = await readLibrary(page);
            let dialog = await openBulkAction(page, "export");
            const category = dialog.getByRole("radio", { name: /^当前分类/u });
            assert.equal(await category.isChecked(), true);
            assert.match(
                (await category.getAttribute("aria-label")) ?? (await category.locator("..").innerText()),
                /4/u
            );
            await assertArchive(page, dialog, sources);

            dialog = await openBulkAction(page, "export");
            await dialog.getByRole("radio", { name: /^全部书籍/u }).check();
            await assertArchive(page, dialog, [...sources, sharedCopy]);
            assert.deepEqual(await readLibrary(page), beforeExport);

            // 全部页面只有一个实际范围，不因搜索仍有内容而缩小导出集合。
            await page.locator('#category-navigation button[data-id=""]').click();
            await waitForBookCount(page, 3);
            dialog = await openBulkAction(page, "export");
            assert.equal(await dialog.getByRole("radio", { name: /^当前分类/u }).count(), 0);
            await assertArchive(page, dialog, [...sources, sharedCopy]);
        });
    });

    void test(`${delivery}: category clearing preserves shared sources and other progress until explicit full clearing`, async () => {
        await withPage(
            delivery,
            async (page) => {
                const shared = [
                    textBook("shared.txt", 2),
                    {
                        name: "shared.epub",
                        mimeType: "application/epub+zip",
                        buffer: createEpubFixture('<p>跨分类保留的正文。</p><img src="pixel.png" alt="图片"/>'),
                    },
                ];
                await importBooks(page, [...shared, textBook("category-only.txt", 4)]);
                await page.locator('#category-navigation button[data-id="fiction"]').click();
                await waitForBookCount(page, 0);
                const retained = shared.map((source) => ({ ...source, name: `retained-${source.name}` }));
                await importBooks(page, retained);
                await page.locator("#toggle-setting-panel").click();
                await page.getByRole("slider", { name: "封面大小", exact: true }).press("ArrowRight");
                await page.locator("#setting .close").click();
                const beforeClear = await readLibrary(page);
                assert.equal(beforeClear.stores["file"]?.length, 3);

                await page.locator('#category-navigation button[data-id="collection"]').click();
                await page.locator("#book-search").fill("category-only");
                await waitForBookCount(page, 1);
                let dialog = await openBulkAction(page, "clear");
                assert.equal(await dialog.getByRole("radio", { name: /^当前分类/u }).isChecked(), true);
                await dialog.getByRole("radio", { name: /^全部书籍/u }).check();
                await dialog.getByRole("button", { name: "取消", exact: true }).click();
                assert.deepEqual(await readLibrary(page), beforeClear);

                // 在首本删除后模拟存储失败，整批记录和共享资源必须一起回滚。
                await page.evaluate(() => {
                    // eslint-disable-next-line @typescript-eslint/unbound-method -- 故障注入保留原方法，并以当前 store 调用。
                    const remove = IDBObjectStore.prototype.delete;
                    let deletedBooks = 0;
                    IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange) {
                        if (this.name === "book" && ++deletedBooks === 2) {
                            IDBObjectStore.prototype.delete = remove;
                            throw new DOMException("Injected bulk deletion failure", "UnknownError");
                        }
                        return remove.call(this, key);
                    };
                });
                dialog = await openBulkAction(page, "clear");
                await dialog.locator(".confirm-btn").click();
                const failure = page.getByRole("dialog", { name: "清空书籍失败", exact: true });
                await failure.waitFor();
                await failure.getByRole("button", { name: "知道了", exact: true }).click();
                await waitForBookCount(page, 1);
                assert.deepEqual(await readLibrary(page), beforeClear);

                // 另一个标签页替换一本书，数量不变也必须拒绝删除已变化的确认范围。
                dialog = await openBulkAction(page, "clear");
                const otherPage = await page.context().newPage();
                try {
                    await otherPage.goto(page.url());
                    await waitForBookCount(otherPage, 5);
                    await importBooks(otherPage, [textBook("replacement.txt", 5)]);
                    const replaced = otherPage
                        .locator(".book")
                        .filter({ has: otherPage.getByTitle("category-only.txt", { exact: true }) });
                    await replaced.locator(".book-more").click();
                    await replaced.locator(".book-delete").click();
                    await otherPage
                        .getByRole("dialog", { name: "删除书籍", exact: true })
                        .getByRole("button", { name: "删除", exact: true })
                        .click();
                    await waitForBookCount(otherPage, 5);
                } finally {
                    await otherPage.close();
                }
                const beforeRejectedClear = await readLibrary(page);
                await dialog.locator(".confirm-btn").click();
                await failure.waitFor();
                assert.match(await failure.innerText(), /书籍已变化，本次未删除/u);
                await failure.getByRole("button", { name: "知道了", exact: true }).click();
                assert.deepEqual(await readLibrary(page), beforeRejectedClear);

                // 新请求使用最新集合，恢复当前分类并删除搜索未显示的全部分类内容。
                dialog = await openBulkAction(page, "clear");
                assert.equal(await dialog.getByRole("radio", { name: /^当前分类/u }).isChecked(), true);
                await dialog.locator(".confirm-btn").click();
                await waitForBookCount(page, 0);
                const afterCategory = await readLibrary(page);
                assert.equal(afterCategory.stores["book"]?.length, 2);
                assert.equal(afterCategory.stores["progress"]?.length, 2);
                assert.equal(afterCategory.stores["file"]?.length, 2);
                assert.equal(afterCategory.stores["toc"]?.length, 2);
                assert.equal(afterCategory.stores["chapter"]?.length, 3);
                assert.equal(afterCategory.appearance, beforeClear.appearance);
                assert.deepEqual(
                    afterCategory.stores["book"],
                    beforeClear.stores["book"]?.filter(
                        (record) =>
                            record !== null &&
                            typeof record === "object" &&
                            "categoryId" in record &&
                            record.categoryId === "fiction"
                    )
                );
                const retainedIds = new Set(
                    afterCategory.stores["book"].map((record) => {
                        assert(record !== null && typeof record === "object" && "id" in record);
                        return record.id;
                    })
                );
                assert.deepEqual(
                    afterCategory.stores["progress"],
                    beforeClear.stores["progress"]?.filter(
                        (record) =>
                            record !== null &&
                            typeof record === "object" &&
                            "bookId" in record &&
                            retainedIds.has(record.bookId)
                    )
                );

                // 空分类保持选中当前范围并禁止执行，不静默扩大到全库。
                dialog = await openBulkAction(page, "clear");
                assert.equal(await dialog.getByRole("radio", { name: /^当前分类/u }).isChecked(), true);
                assert.equal(await dialog.locator(".confirm-btn").isDisabled(), true);
                await dialog.getByRole("button", { name: "取消", exact: true }).click();
                dialog = await openBulkAction(page, "export");
                assert.equal(await dialog.getByRole("radio", { name: /^当前分类/u }).isChecked(), true);
                assert.equal(await dialog.locator(".confirm-btn").isDisabled(), true);
                await dialog.getByRole("button", { name: "取消", exact: true }).click();

                await page.locator("#book-search").fill("");
                await page.locator('#category-navigation button[data-id="fiction"]').click();
                await waitForBookCount(page, 2);
                await page.reload();
                await waitForBookCount(page, 2);
                assert.deepEqual(await readLibrary(page), afterCategory);
                dialog = await openBulkAction(page, "export");
                await assertArchive(page, dialog, retained);
                for (const book of retained) {
                    await openBook(page, book.name);
                    assert.match((await page.locator("#content").textContent()) ?? "", /正文|验证阅读/u);
                    await page.locator("#return-bookshelf").click();
                    await waitForBookCount(page, 2);
                }

                dialog = await openBulkAction(page, "clear");
                await dialog.getByRole("radio", { name: /^全部书籍/u }).check();
                await dialog.locator(".confirm-btn").click();
                await waitForBookCount(page, 0);
                const afterAll = await readLibrary(page);
                assert.deepEqual(afterAll.stores, { book: [], chapter: [], file: [], progress: [], toc: [] });
                assert.equal(afterAll.appearance, beforeClear.appearance);
                await page.reload();
                await waitForBookCount(page, 0);
                assert.deepEqual(await readLibrary(page), afterAll);
            },
            ["清空书籍失败", "清空书籍失败"]
        );
    });
}
