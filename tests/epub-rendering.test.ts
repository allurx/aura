/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, before, test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";
import {
    importBooks,
    openBook,
    setMode,
    settleReader,
    startBrowserTests,
    stopBrowserTests,
    waitForChapterLayout,
    withPage,
} from "./browser-test-support.ts";

before(startBrowserTests);
after(stopBrowserTests);

/**
 * 使用不同归档路径表示图文书中的独立资源，字节仍使用已验证的最小 PNG。
 */
function illustratedBook(imageCount: number): Buffer {
    const body =
        '<p><a href="chapter.xhtml#last-image">查看末尾插图</a></p>' +
        `<p>${"首屏正文保持可读，不等待章末插图。".repeat(1000)}</p>` +
        Array.from(
            { length: imageCount },
            (_, index) =>
                `<p><img ${index === imageCount - 1 ? 'id="last-image" ' : ""}src="image-${String(index)}.png" alt="插图${String(index)}"/></p>`
        ).join("");
    const files = unzipSync(createEpubFixture(body));
    const pixel = files["OEBPS/pixel.png"];
    const packageXml = files["OEBPS/package.opf"];
    assert(pixel && packageXml);
    const items: string[] = [];
    for (let index = 0; index < imageCount; index++) {
        const name = `image-${String(index)}`;
        files[`OEBPS/${name}.png`] = pixel;
        items.push(`<item id="${name}" href="${name}.png" media-type="image/png"/>`);
    }
    files["OEBPS/package.opf"] = strToU8(strFromU8(packageXml).replace("</manifest>", `${items.join("")}</manifest>`));
    return Buffer.from(zipSync(files, { level: 0 }));
}

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: EPUB rendering retains empty table and list structures`, async () => {
        await withPage(delivery, async (page) => {
            const body =
                "<h2>空结构</h2><div>" +
                '<table><tbody><tr><td rowspan="2">A</td><td></td></tr><tr><td></td></tr><tr><td colspan="2"></td></tr></tbody></table>' +
                "<table><tbody><tr><td></td><td></td></tr></tbody></table>" +
                "<ol><li>首项</li><li></li><li></li></ol></div>";
            await importBooks(page, [
                { name: "structures.epub", mimeType: "application/epub+zip", buffer: createEpubFixture(body) },
            ]);
            await openBook(page, "structures.epub");
            for (const mode of ["none", "scroll"] as const) {
                await setMode(page, mode);
                const actual = await page
                    .locator("#content > .reading-viewport:not(.reading-measure-viewport)")
                    .evaluate((viewport) => {
                        return {
                            tables: [...viewport.querySelectorAll("table")].map((table) =>
                                [...table.rows].map((row) =>
                                    [...row.cells].map((cell) => ({
                                        text: cell.textContent,
                                        row: cell.rowSpan,
                                        col: cell.colSpan,
                                    }))
                                )
                            ),
                            items: [...viewport.querySelectorAll("li")].map((item) => ({
                                text: item.textContent,
                                value: item.value,
                            })),
                        };
                    });
                assert.deepEqual(actual.tables, [
                    [
                        [
                            { text: "A", row: 2, col: 1 },
                            { text: "", row: 1, col: 1 },
                        ],
                        [{ text: "", row: 1, col: 1 }],
                        [{ text: "", row: 1, col: 2 }],
                    ],
                    [
                        [
                            { text: "", row: 1, col: 1 },
                            { text: "", row: 1, col: 1 },
                        ],
                    ],
                ]);
                assert.deepEqual(actual.items, [
                    { text: "首项", value: 1 },
                    { text: "", value: 2 },
                    { text: "", value: 3 },
                ]);
            }
        });
    });

    void test(`${delivery}: accepted EPUB empty structures retain their content and whitespace boundaries`, async () => {
        const samples = [
            {
                name: "empty-structure-limit.epub",
                content: "<ol><li>空结构边界正文</li>" + "<li></li>".repeat(1024) + "</ol>",
                itemCount: 1025,
            },
            {
                name: "empty-structure-whitespace.epub",
                content:
                    "<ol><li>空白分隔正文</li>" +
                    "<li></li>".repeat(600) +
                    "<li> </li>" +
                    "<li></li>".repeat(600) +
                    "</ol>",
                itemCount: 1202,
            },
        ];
        for (const sample of samples) {
            await withPage(delivery, async (page) => {
                await importBooks(page, [
                    {
                        name: sample.name,
                        mimeType: "application/epub+zip",
                        buffer: createEpubFixture(sample.content),
                    },
                ]);
                await openBook(page, sample.name);
                const viewport = page.locator("#content > .reading-viewport:not(.reading-measure-viewport)");
                assert.equal(await viewport.locator("li").count(), sample.itemCount);
                await setMode(page, "scroll");
                assert.equal(await viewport.locator("li").count(), sample.itemCount);
            });
        }
    });

    void test(`${delivery}: zero-length EPUB structures belong to one side of a reading seam`, async () => {
        const first = "甲".repeat(6000);
        const second = "乙".repeat(14000);
        const marker = '<span id="seam" lang="zxx"></span>';
        const following = '<span lang="und"></span>';
        for (const content of [
            `<p>${first}${marker}${following}${second}</p>`,
            `<p>${first}${marker}</p>${following}<p>${second}</p>`,
            `<ol><li>${first}${marker}</li><li>${following}${second}</li></ol>`,
        ]) {
            await withPage(delivery, async (page) => {
                const body = '<p><a href="chapter.xhtml#seam">进入接缝</a></p><div>' + content + "</div>";
                await importBooks(page, [
                    { name: "seam.epub", mimeType: "application/epub+zip", buffer: createEpubFixture(body) },
                ]);
                await openBook(page, "seam.epub");
                await page.locator('#content a[data-book-fragment="seam"]').click();
                await settleReader(page);
                const viewport = page.locator("#content > .reading-viewport:not(.reading-measure-viewport)");
                for (const width of [1440, 650, 1440]) {
                    await page.setViewportSize({ width, height: 900 });
                    await settleReader(page);
                    assert.equal(await viewport.locator('[lang="zxx"]').count(), 1);
                    assert.equal(await viewport.locator('[lang="und"]').count(), 1);
                }
                await waitForChapterLayout(page);
                assert.equal(await viewport.locator('[lang="zxx"]').count(), 1);
            });
        }
    });

    void test(`${delivery}: image resources remain bounded during chapter layout and are released on exit`, async () => {
        await withPage(delivery, async (page) => {
            const imageCount = 400;
            await importBooks(page, [
                { name: "illustrated.epub", mimeType: "application/epub+zip", buffer: illustratedBook(imageCount) },
            ]);
            // 观察真实 Blob URL 的生命周期，不读取阅读器私有字段或要求某个精确的窗口大小。
            const resources = await page.evaluateHandle(() => {
                const state = { active: new Set<string>(), peak: 0 };
                const create = URL.createObjectURL.bind(URL);
                const revoke = URL.revokeObjectURL.bind(URL);
                URL.createObjectURL = (object) => {
                    const url = create(object);
                    state.active.add(url);
                    state.peak = Math.max(state.peak, state.active.size);
                    return url;
                };
                URL.revokeObjectURL = (url) => {
                    state.active.delete(url);
                    revoke(url);
                };
                return state;
            });
            try {
                // 章末图片尚未就绪时，前面的纯文字窗口仍须打开；不以 decode 调用数代替首屏可用。
                const decoding = await page.evaluateHandle(() => {
                    const gate = Promise.withResolvers<undefined>();
                    // eslint-disable-next-line @typescript-eslint/unbound-method -- 门控保持原生方法，并以实际图片作为接收者。
                    const decode = HTMLImageElement.prototype.decode;
                    HTMLImageElement.prototype.decode = function () {
                        return gate.promise.then(() => decode.call(this));
                    };
                    return {
                        release: () => {
                            HTMLImageElement.prototype.decode = decode;
                            gate.resolve(undefined);
                        },
                    };
                });
                try {
                    await openBook(page, "illustrated.epub");
                    assert.match(
                        (await page
                            .locator("#content > .reading-viewport:not(.reading-measure-viewport)")
                            .textContent()) ?? "",
                        /首屏正文保持可读/u
                    );
                } finally {
                    await decoding.evaluate((gate) => {
                        gate.release();
                    });
                    await decoding.dispose();
                }
                const first = await resources.evaluate((state) => ({ active: state.active.size, peak: state.peak }));
                assert(first.peak < imageCount / 2, "Opening text must not prepare every image in the chapter");
                await waitForChapterLayout(page);
                const completed = await resources.evaluate((state) => ({
                    active: state.active.size,
                    peak: state.peak,
                }));
                assert(completed.peak < imageCount / 2, "Completed layout must not retain all chapter images");

                // 已经释放的远处资源可再次进入真实正文，图片仍能加载且保留原图尺寸。
                await page.locator('#content a[data-book-fragment="last-image"]').click();
                await settleReader(page);
                await page.waitForFunction(
                    (alt) => {
                        const viewport = document.querySelector(
                            "#content > .reading-viewport:not(.reading-measure-viewport)"
                        );
                        const image = [...(viewport?.querySelectorAll("img") ?? [])].find((item) => item.alt === alt);
                        return image?.complete && image.naturalWidth === 1 && image.width === 1 && image.height === 1;
                    },
                    `插图${String(imageCount - 1)}`
                );
                await page.locator("#return-bookshelf").click();
                await page.locator("#bookshelf").waitFor();
                assert.equal(await resources.evaluate((state) => state.active.size), 0);

                // 在新会话的后台索引仍运行时退出，测量片段不能延长 URL 的生命周期。
                await openBook(page, "illustrated.epub");
                await page.locator('#page-position[aria-busy="true"]').waitFor();
                await page.locator("#return-bookshelf").click();
                await page.locator("#bookshelf").waitFor();
                assert.equal(await resources.evaluate((state) => state.active.size), 0);
            } finally {
                await resources.dispose();
            }
        });
    });
}
