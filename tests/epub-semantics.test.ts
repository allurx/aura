/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, before, test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Page } from "playwright-core";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";
import { importBooks, openBook, startBrowserTests, stopBrowserTests, withPage } from "./browser-test-support.ts";

before(startBrowserTests);
after(stopBrowserTests);

/**
 * 复用完整 EPUB fixture，只调整正文文档的继承入口，不影响导航和原文件导出契约。
 */
function semanticEpub(content: string, rootAttributes = "", bodyAttributes = ""): Buffer {
    const entries = unzipSync(createEpubFixture(content));
    const chapter = entries["OEBPS/chapter.xhtml"];
    assert(chapter);
    entries["OEBPS/chapter.xhtml"] = strToU8(
        strFromU8(chapter)
            .replace(
                '<html xmlns="http://www.w3.org/1999/xhtml">',
                `<html xmlns="http://www.w3.org/1999/xhtml" ${rootAttributes}>`
            )
            .replace("<body>", `<body ${bodyAttributes}>`)
    );
    return Buffer.from(zipSync(entries, { level: 0, mtime: new Date(2026, 9, 21) }));
}

/**
 * 在真实正文窗口中检查生效语义，避免将后台测量副本或仅持久化字段当作呈现结果。
 */
async function semanticsOf(page: Page, text: string) {
    return page
        .locator("#content > .reading-viewport:not(.reading-measure-viewport)")
        .getByText(text, { exact: true })
        .evaluate((element) => ({
            dir: getComputedStyle(element).direction,
            lang: element.closest("[lang]")?.getAttribute("lang"),
            tag: element.tagName.toLowerCase(),
            hasUnsafeAttributes:
                element.hasAttribute("onclick") || /\bcolor\s*:/u.test(element.getAttribute("style") ?? ""),
        }));
}

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: EPUB preserves inherited language and direction through safe content projection`, async () => {
        await withPage(delivery, async (page) => {
            const books = [
                {
                    name: "root-semantics.epub",
                    buffer: semanticEpub(
                        '<p>مرحبا بالعالم 123.</p><p lang="en" dir="ltr">English paragraph</p>' +
                            '<p><span xml:lang="fr" dir="ltr">Bonjour</span> ' +
                            '<abbr lang="de" dir="LTR" onclick="throw 1" style="color:red">Guten Tag</abbr></p>',
                        'dir="RTL" lang="ar" xml:lang="ar"'
                    ),
                },
                {
                    name: "body-semantics.epub",
                    buffer: semanticEpub(
                        '<p>Texte français</p><p lang="">Unknown language</p>' +
                            '<img src="pixel.png" alt="English image" lang="en" dir="ltr"/>',
                        'dir="rtl" lang="ar"',
                        'dir="ltr" xml:lang="fr"'
                    ),
                },
                {
                    name: "empty-language.epub",
                    buffer: semanticEpub("<p>Explicitly unknown</p>", 'lang="en"', 'lang=""'),
                },
                {
                    name: "plain-chinese.epub",
                    buffer: semanticEpub("<p>普通中文正文。</p>"),
                },
            ].map((book) => ({ ...book, mimeType: "application/epub+zip" }));
            await importBooks(page, books);

            // html 继承、局部覆盖和降级为安全 span 的节点都保留原有语义。
            await openBook(page, "root-semantics.epub");
            assert.deepEqual(await semanticsOf(page, "مرحبا بالعالم 123."), {
                dir: "rtl",
                lang: "ar",
                tag: "p",
                hasUnsafeAttributes: false,
            });
            assert.equal((await semanticsOf(page, "English paragraph")).lang, "en");
            assert.equal((await semanticsOf(page, "English paragraph")).dir, "ltr");
            assert.equal((await semanticsOf(page, "Bonjour")).lang, "fr");
            assert.deepEqual(await semanticsOf(page, "Guten Tag"), {
                dir: "ltr",
                lang: "de",
                tag: "span",
                hasUnsafeAttributes: false,
            });
            await page.reload();
            await page.locator("#content > .reading-viewport:not(.reading-measure-viewport) p").first().waitFor();
            assert.equal((await semanticsOf(page, "مرحبا بالعالم 123.")).dir, "rtl");
            assert.equal((await semanticsOf(page, "مرحبا بالعالم 123.")).lang, "ar");

            // body 覆盖根元素；空语言值与图片替代文本使用各自的语义。
            await page.locator("#return-bookshelf").click();
            await openBook(page, "body-semantics.epub");
            assert.equal((await semanticsOf(page, "Texte français")).lang, "fr");
            assert.equal((await semanticsOf(page, "Texte français")).dir, "ltr");
            assert.equal((await semanticsOf(page, "Unknown language")).lang, "");
            const image = page
                .locator("#content > .reading-viewport:not(.reading-measure-viewport)")
                .getByAltText("English image");
            assert.equal(await image.getAttribute("lang"), "en");
            assert.equal(await image.getAttribute("dir"), "ltr");
            assert.equal(await image.getAttribute("width"), "1");
            assert.equal(await image.getAttribute("height"), "1");

            await page.locator("#return-bookshelf").click();
            await openBook(page, "empty-language.epub");
            assert.equal((await semanticsOf(page, "Explicitly unknown")).lang, "");
            await page.locator("#return-bookshelf").click();
            await openBook(page, "plain-chinese.epub");
            assert.equal((await semanticsOf(page, "普通中文正文。")).lang, "zh-CN");
        });
    });
}
