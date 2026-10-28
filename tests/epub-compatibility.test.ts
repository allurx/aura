/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
    importBooks,
    openBook,
    setMode,
    settleReader,
    startBrowserTests,
    stopBrowserTests,
    withPage,
} from "./browser-test-support.ts";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";

before(startBrowserTests);
after(stopBrowserTests);

/**
 * 超过旧整书节点预算的普通多章长篇；每章保持较小，测试总量兼容而不制造巨型局部结构。
 */
function longEpub(): Buffer {
    const entries = unzipSync(createEpubFixture(""));
    const chapter = entries["OEBPS/chapter.xhtml"];
    const packageFile = entries["OEBPS/package.opf"];
    assert(chapter && packageFile);
    const template = strFromU8(chapter);
    const items: string[] = [];
    const references: string[] = [];
    const links: string[] = [];
    delete entries["OEBPS/chapter.xhtml"];
    for (let index = 1; index <= 501; index++) {
        const number = String(index);
        const path = `chapter-${number}.xhtml`;
        const body =
            `<h2>长篇章节 ${number}</h2>` +
            Array.from(
                { length: 500 },
                (_, line) => `<p>章节 ${number}，段落 ${String(line + 1)}，正文保持完整。</p>`
            ).join("");
        entries[`OEBPS/${path}`] = strToU8(template.replace("<body></body>", `<body><main>${body}</main></body>`));
        items.push(`<item id="chapter-${number}" href="${path}" media-type="application/xhtml+xml"/>`);
        references.push(`<itemref idref="chapter-${number}"/>`);
        links.push(`<li><a href="${path}">长篇章节 ${number}</a></li>`);
    }
    entries["OEBPS/package.opf"] = strToU8(
        strFromU8(packageFile)
            .replace(
                /<manifest>[\s\S]*?<\/manifest>/u,
                `<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${items.join("")}</manifest>`
            )
            .replace(/<spine>[\s\S]*?<\/spine>/u, `<spine>${references.join("")}</spine>`)
    );
    entries["OEBPS/nav.xhtml"] = strToU8(
        template.replace(
            "<body></body>",
            `<body><nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol>${links.join("")}</ol></nav></body>`
        )
    );
    return Buffer.from(zipSync(entries, { level: 1, mtime: new Date(2026, 9, 28) }));
}

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: long EPUB imports, reaches its last chapter and exports the original bytes`, async () => {
        await withPage(delivery, async (page) => {
            page.setDefaultTimeout(30_000);
            const book = { name: "long-epub.epub", mimeType: "application/epub+zip", buffer: longEpub() };
            await importBooks(page, [book]);
            await openBook(page, book.name);
            assert.match((await page.locator("#content").textContent()) ?? "", /章节 1，段落 1/);

            // 从公开目录搜索进入远端章节，覆盖虚拟目录与整书内容均已保存。
            await page.locator("#toggle-toc-panel").click();
            await page.locator("#toc-search").fill("长篇章节 501");
            await page.locator('#toc-chapters button[data-chapter-number="501"]').click();
            await page.locator("#toc[open]").waitFor({ state: "hidden" });
            await settleReader(page);
            assert.match((await page.locator("#content").textContent()) ?? "", /章节 501，段落 1/);
            await page.reload();
            await page.locator("#content > .reading-viewport:not(.reading-measure-viewport) p").first().waitFor();
            assert.match((await page.locator("#content").textContent()) ?? "", /章节 501，段落 1/);

            await page.locator("#return-bookshelf").click();
            const card = page.locator(".book").filter({ has: page.getByTitle(book.name, { exact: true }) });
            await card.locator(".book-more").click();
            const pending = page.waitForEvent("download");
            await card.locator(".book-export").click();
            const download = await pending;
            assert.equal(download.suggestedFilename(), book.name);
            const path = await download.path();
            assert(path);
            assert.deepEqual(await readFile(path), book.buffer);
        });
    });

    void test(`${delivery}: object alternatives preserve text, table semantics and internal navigation offline`, async () => {
        await withPage(delivery, async (page) => {
            const externalRequests: string[] = [];
            page.on("request", (request) => {
                if (request.url().startsWith("https://example.invalid/")) externalRequests.push(request.url());
            });
            const body =
                '<p><a href="#equivalent">查看等价表格</a></p>' +
                '<object data="https://example.invalid/book.xlsx" type="application/vnd.ms-excel" id="equivalent" lang="zh-CN">' +
                "<table><caption>作者提供的等价内容</caption><tbody><tr><th>年份</th><td>2026</td></tr></tbody></table></object>" +
                '<p>前文<object type="image/png" data="missing.png" id="inline-alternative">行内替代文字</object>后文</p>';
            await importBooks(page, [
                { name: "alternatives.epub", mimeType: "application/epub+zip", buffer: createEpubFixture(body) },
            ]);
            await openBook(page, "alternatives.epub");
            const content = page.locator("#content > .reading-viewport:not(.reading-measure-viewport)");
            assert.equal(await content.locator("table").count(), 1);
            assert.equal(await content.locator("th").innerText(), "年份");
            assert.equal(await content.locator("td").innerText(), "2026");
            assert.match((await content.textContent()) ?? "", /前文行内替代文字后文/);
            assert.equal(await content.locator("object, iframe").count(), 0);
            await content.getByRole("link", { name: "查看等价表格" }).click();
            await settleReader(page);
            await setMode(page, "scroll");
            await page.reload();
            await content.locator("table").waitFor();
            assert.match((await content.textContent()) ?? "", /作者提供的等价内容/);
            assert.deepEqual(externalRequests, []);
        });
    });
}
