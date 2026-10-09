/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
    importBooks,
    openBook,
    selectChapter,
    setMode,
    settleReader,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    waitForBookCount,
    withPage,
} from "./browser-test-support.ts";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";

before(startBrowserTests);
after(stopBrowserTests);

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: windowed bookshelf keeps offscreen books searchable and readable after deletion`, async () => {
        await withPage(delivery, async (page) => {
            await page.setViewportSize({ width: 900, height: 650 });
            const books = Array.from({ length: 60 }, (_, index) =>
                textBook(`shelf-${String(index).padStart(2, "0")}.txt`)
            );
            await importBooks(page, books);

            // 总数覆盖整批书籍，实际挂载只保留窗口；窗口外书籍仍经正常搜索可达。
            const mounted = await page
                .locator(".book-open")
                .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("title")));
            assert(
                mounted.length > 0 && mounted.length < books.length,
                `Expected a bounded bookshelf, received ${String(mounted.length)} cards`
            );
            const target = books.findLast((book) => !mounted.includes(book.name));
            assert(target);
            await page.locator("#book-search").fill(target.name.replace(/\.txt$/, ""));
            await waitForBookCount(page, 1);
            await openBook(page, target.name);
            await selectChapter(page, 2);
            await page.locator("#return-bookshelf").click();
            await waitForBookCount(page, 1);
            const targetCard = page.locator(".book").filter({ has: page.getByTitle(target.name, { exact: true }) });
            assert.equal(await targetCard.locator(".book-progress").textContent(), "2/3");

            // 删除搜索找到的书籍后，其他共享同一原文件的书籍仍可继续阅读。
            await targetCard.locator(".book-more").click();
            await targetCard.locator(".book-delete").click();
            await page
                .getByRole("dialog", { name: "删除书籍", exact: true })
                .getByRole("button", { name: "删除", exact: true })
                .click();
            await waitForBookCount(page, 0);
            await page.locator("#book-search").fill("");
            await waitForBookCount(page, 59);
            const remaining = books.find((book) => book !== target);
            assert(remaining);
            await page.locator("#book-search").fill(remaining.name.replace(/\.txt$/, ""));
            await waitForBookCount(page, 1);
            await openBook(page, remaining.name);
            assert.match((await page.locator("#content").textContent()) ?? "", /这是章节1的第1段/);
        });
    });

    void test(`${delivery}: shared TXT and EPUB sources survive deletion and export byte for byte`, async () => {
        await withPage(delivery, async (page) => {
            const sources = [
                {
                    name: "original.txt",
                    mimeType: "text/plain",
                    buffer: Buffer.concat([
                        Buffer.from([0xff, 0xfe]),
                        Buffer.from("第一章 原始文件\r\n保留 UTF-16 字节与换行。\r\n", "utf16le"),
                    ]),
                },
                {
                    name: "original.epub",
                    mimeType: "application/epub+zip",
                    buffer: createEpubFixture(
                        '<p><![CDATA[保留正文 <tag> & text]]></p><img src="pixel.png" alt="图片"/>'
                    ),
                },
            ];
            const copies = sources.map((source) => ({ ...source, name: source.name.replace("original", "copy") }));
            await importBooks(page, [...sources, ...copies]);

            // 从真实删除入口移除首份书籍，共享内容仍须支持另一份阅读与原文件导出。
            for (const source of sources) {
                const card = page.locator(".book").filter({ has: page.getByTitle(source.name, { exact: true }) });
                await card.locator(".book-more").click();
                await card.locator(".book-delete").click();
                await page
                    .getByRole("dialog", { name: "删除书籍", exact: true })
                    .getByRole("button", { name: "删除", exact: true })
                    .click();
                await card.waitFor({ state: "detached" });
                await page.locator(".overlay").waitFor({ state: "hidden" });
            }
            assert.equal(await page.locator(".book").count(), 2);

            for (const copy of copies) {
                await openBook(page, copy.name);
                assert.match((await page.locator("#content").textContent()) ?? "", /保留/);
                await page.locator("#return-bookshelf").click();
                const card = page.locator(".book").filter({ has: page.getByTitle(copy.name, { exact: true }) });
                await card.locator(".book-more").click();
                const pending = page.waitForEvent("download");
                await card.locator(".book-export").click();
                const download = await pending;
                assert.equal(download.suggestedFilename(), copy.name);
                const path = await download.path();
                assert(path);
                assert.deepEqual(await readFile(path), copy.buffer);
            }
        });
    });

    void test(`${delivery}: navigation, layout changes and reload preserve reading content`, async () => {
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("reading.txt", 3, 80)]);
            await openBook(page, "reading.txt");
            await setMode(page, "none");
            await selectChapter(page, 2);
            await page.locator("#previous-page").click();
            await settleReader(page);
            const lastPage = (await page.locator("#page-position").getAttribute("aria-label"))?.match(/\d+/g);
            assert(lastPage?.length === 2);
            assert.equal(lastPage[0], lastPage[1]);
            await page.locator("#next-page").click();
            await settleReader(page);
            assert.match((await page.locator("#chapter-title").textContent()) ?? "", /第2章/);
            assert.match((await page.locator("#page-position").getAttribute("aria-label")) ?? "", /第\s*1\s*页/);
            await page.locator("#next-page").click();
            await settleReader(page);

            // 断言实际可见正文，不把内部页码或像素当作跨排版的内容位置。
            const visibleParagraphs = () =>
                page.locator("#content p").evaluateAll((paragraphs) => {
                    const viewport = document.querySelector(".reading-viewport")?.getBoundingClientRect();
                    if (!viewport) throw new Error("Missing reading viewport");
                    return paragraphs
                        .filter((paragraph) =>
                            [...paragraph.getClientRects()].some(
                                (rect) =>
                                    rect.bottom > viewport.top + 1 &&
                                    rect.top < viewport.bottom - 1 &&
                                    rect.right > viewport.left + 1 &&
                                    rect.left < viewport.right - 1
                            )
                        )
                        .map((paragraph) => paragraph.textContent);
                });
            const anchor = (await visibleParagraphs())[0];
            assert(anchor);
            for (const mode of ["scroll", "cover", "slide", "none"] as const) {
                await setMode(page, mode);
                assert((await visibleParagraphs()).includes(anchor));
            }
            await page.locator("#toggle-setting-panel").click();
            await page.locator("#setting-control-font-size").fill("25");
            await page.locator("#setting .close").click();
            await settleReader(page);
            assert((await visibleParagraphs()).includes(anchor));
            const saved = await page.locator("#page-position").getAttribute("aria-label");
            await page.reload();
            await page.locator("#content .reading-chapter").waitFor();
            await settleReader(page);
            assert.equal(await page.locator("#page-position").getAttribute("aria-label"), saved);
            assert((await visibleParagraphs()).includes(anchor));

            await selectChapter(page, 3);
            await setMode(page, "scroll");
            await page.locator(".reading-viewport").evaluate((viewport) => {
                viewport.scrollTop = viewport.scrollHeight;
            });
            await page.waitForFunction(() => document.querySelector<HTMLButtonElement>("#next-page")?.disabled);
            assert.equal(Number.parseFloat((await page.locator("#progress-rate").textContent()) ?? ""), 100);
        });
    });
}
