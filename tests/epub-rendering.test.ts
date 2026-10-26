/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, before, test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Request } from "playwright-core";
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

interface ImageRequestFailure {
    url: string;
    type: string;
    error: string;
    canceled: boolean;
    // 与浏览器 performance.timeOrigin + performance.now() 对齐的毫秒时间。
    time: number;
}

/**
 * 仅认可已退出会话实际清理的尺寸探针；网络失败必须发生在清理之后。
 */
function expectedImageCancellations(
    failures: readonly ImageRequestFailure[],
    releasedProbes: Map<string, number>
): string[] {
    return failures
        .filter((failure) => {
            const releasedAt = releasedProbes.get(failure.url);
            return (
                failure.type === "Image" &&
                failure.error === "net::ERR_ABORTED" &&
                failure.canceled &&
                releasedAt !== undefined &&
                failure.time >= releasedAt
            );
        })
        .map((failure) => `Request failed: ${failure.url} (${failure.error})`);
}

/**
 * 在浏览器内观察真实资源与退出清理，不读取阅读器私有字段或改变原生解码结果。
 */
function observeImageResources() {
    const state = { active: new Set<string>(), peak: 0, releasedProbes: new Map<string, number>() };
    const retired = new Set<string>();
    const probes = new WeakMap<HTMLImageElement, Element>();
    const exiting = new WeakSet<Element>();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 保存原生方法，包装与恢复时保留接收者。
    const decode = HTMLImageElement.prototype.decode;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 保存原生方法，包装与恢复时保留接收者。
    const removeAttribute = Element.prototype.removeAttribute;

    // 只记录本观察器创建且撤销时没有正文或投影引用的 URL。
    URL.createObjectURL = (object) => {
        const url = create(object);
        state.active.add(url);
        state.peak = Math.max(state.peak, state.active.size);
        return url;
    };
    URL.revokeObjectURL = (url) => {
        if (state.active.delete(url) && ![...document.querySelectorAll("img")].some((image) => image.src === url))
            retired.add(url);
        revoke(url);
    };
    HTMLImageElement.prototype.decode = function () {
        const reader = document.querySelector("#reader");
        if (reader && !this.isConnected) probes.set(this, reader);
        return decode.call(this);
    };
    const onReturn = (event: MouseEvent): void => {
        const reader = document.querySelector("#reader");
        if (reader && event.target instanceof Element && event.target.closest("#return-bookshelf")) exiting.add(reader);
    };
    document.addEventListener("click", onReturn, true);

    // 点击返回尚不代表退出成功；必须等所属 Reader 已移除，且未完成的独立探针确实清空 src。
    Element.prototype.removeAttribute = function (name) {
        if (name === "src" && this instanceof HTMLImageElement) {
            const reader = probes.get(this);
            if (
                reader &&
                exiting.has(reader) &&
                !reader.isConnected &&
                !this.isConnected &&
                !this.complete &&
                this.naturalWidth === 0 &&
                retired.has(this.src)
            )
                state.releasedProbes.set(this.src, performance.timeOrigin + performance.now());
        }
        removeAttribute.call(this, name);
    };
    return Object.assign(state, {
        restore: () => {
            URL.createObjectURL = create;
            URL.revokeObjectURL = revoke;
            HTMLImageElement.prototype.decode = decode;
            Element.prototype.removeAttribute = removeAttribute;
            document.removeEventListener("click", onReturn, true);
        },
    });
}

void test("image cancellation diagnostics reject failures without matching exit cleanup", () => {
    const url = "blob:null/retired-image";
    const failure: ImageRequestFailure = { url, type: "Image", error: "net::ERR_ABORTED", canceled: true, time: 120 };
    const releasedProbes = new Map([[url, 100]]);
    assert.deepEqual(expectedImageCancellations([failure], releasedProbes), [
        `Request failed: ${url} (net::ERR_ABORTED)`,
    ]);
    for (const unexpected of [
        { ...failure, time: 99 },
        { ...failure, url: "blob:null/active-image" },
        { ...failure, url: "https://example.invalid/image.png" },
        { ...failure, type: "Fetch" },
        { ...failure, error: "net::ERR_FAILED" },
        { ...failure, canceled: false },
    ])
        assert.deepEqual(expectedImageCancellations([unexpected], releasedProbes), [], JSON.stringify(unexpected));
    assert.deepEqual(expectedImageCancellations([failure], new Map()), []);
});

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
    void test(`${delivery}: complete EPUB chapters reuse their rendered geometry for exact layout`, async () => {
        await withPage(delivery, async (page) => {
            const rows = Array.from(
                { length: 80 },
                (_, index) => `<tr><td>左列${String(index)}</td><td>右列${String(index)}</td></tr>`
            ).join("");
            await importBooks(page, [
                {
                    name: "complete-table.epub",
                    mimeType: "application/epub+zip",
                    buffer: createEpubFixture(
                        `<table><tr><td colspan="2"><img src="pixel.png" alt="完整章节插图"/></td></tr>${rows}</table>`
                    ),
                },
            ]);
            const measurement = await page.evaluateHandle(() => {
                const state = { probes: 0 };
                const observer = new MutationObserver((records) => {
                    for (const record of records) {
                        for (const node of record.addedNodes) {
                            if (node instanceof Element && node.matches(".reading-measure-viewport")) state.probes++;
                        }
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                return {
                    state,
                    stop: () => {
                        observer.disconnect();
                    },
                };
            });
            try {
                await openBook(page, "complete-table.epub");
                for (const mode of ["cover", "scroll", "none"] as const) {
                    if (mode !== "cover") await setMode(page, mode);
                    await waitForChapterLayout(page);
                    const viewport = page.locator("#content > .reading-viewport:not(.reading-measure-viewport)");
                    assert.equal(await viewport.locator("tr").count(), 81);
                    assert.equal(await viewport.getByAltText("完整章节插图").getAttribute("width"), "1");
                    assert.equal(await page.locator(".current-page").textContent(), "1");
                    assert.equal(await page.locator(".total-pages").textContent(), "1");
                    assert.equal(await measurement.evaluate(({ state }) => state.probes), 0);
                }
            } finally {
                await measurement.evaluate(({ stop }) => {
                    stop();
                });
                await measurement.dispose();
            }
        });
    });

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
        const expectedErrors: string[] = [];
        await withPage(
            delivery,
            async (page) => {
                const imageCount = 400;
                await importBooks(page, [
                    { name: "illustrated.epub", mimeType: "application/epub+zip", buffer: illustratedBook(imageCount) },
                ]);
                const resources = await page.evaluateHandle(observeImageResources);
                const network = await page.context().newCDPSession(page);
                const requests = new Map<
                    string,
                    { url: string; type: string; clockOffset: number; finished: PromiseWithResolvers<undefined> }
                >();
                const browserRequests = new Map<Request, PromiseWithResolvers<undefined>>();
                const failures: ImageRequestFailure[] = [];
                const onRequest = (request: Request): void => {
                    browserRequests.set(request, Promise.withResolvers<undefined>());
                };
                const onRequestEnd = (request: Request): void => {
                    browserRequests.get(request)?.resolve(undefined);
                    browserRequests.delete(request);
                };
                page.on("request", onRequest);
                page.on("requestfinished", onRequestEnd);
                page.on("requestfailed", onRequestEnd);

                // 使用浏览器实际发生时间，避免延迟送达的退出前失败被归入退出清理。
                network.on("Network.requestWillBeSent", (event) => {
                    requests.set(event.requestId, {
                        url: event.request.url,
                        type: event.type ?? "Other",
                        clockOffset: (event.wallTime - event.timestamp) * 1000,
                        finished: Promise.withResolvers<undefined>(),
                    });
                });
                network.on("Network.loadingFinished", (event) => {
                    requests.get(event.requestId)?.finished.resolve(undefined);
                    requests.delete(event.requestId);
                });
                network.on("Network.loadingFailed", (event) => {
                    const request = requests.get(event.requestId);
                    if (request)
                        failures.push({
                            url: request.url,
                            type: request.type,
                            error: event.errorText,
                            canceled: event.canceled === true,
                            time: request.clockOffset + event.timestamp * 1000,
                        });
                    request?.finished.resolve(undefined);
                    requests.delete(event.requestId);
                });
                try {
                    await network.send("Network.enable");
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
                    const first = await resources.evaluate((state) => ({
                        active: state.active.size,
                        peak: state.peak,
                    }));
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
                            const image = [...(viewport?.querySelectorAll("img") ?? [])].find(
                                (item) => item.alt === alt
                            );
                            return (
                                image?.complete && image.naturalWidth === 1 && image.width === 1 && image.height === 1
                            );
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

                    // 退出取消不损坏资源；新会话仍能恢复末尾插图。
                    await openBook(page, "illustrated.epub");
                    await page.waitForFunction(
                        (alt) => {
                            const viewport = document.querySelector(
                                "#content > .reading-viewport:not(.reading-measure-viewport)"
                            );
                            return [...(viewport?.querySelectorAll("img") ?? [])].some(
                                (image) => image.alt === alt && image.complete && image.naturalWidth === 1
                            );
                        },
                        `插图${String(imageCount - 1)}`
                    );
                    await page.locator("#return-bookshelf").click();
                    await page.locator("#bookshelf").waitFor();
                    assert.equal(await resources.evaluate((state) => state.active.size), 0);

                    // 等待两条观察通道的实际请求终态，不能复用 SPA 早先的 networkidle 状态。
                    let timeout: ReturnType<typeof setTimeout> | undefined;
                    try {
                        await Promise.race([
                            Promise.all([
                                ...[...requests.values()].map((request) => request.finished.promise),
                                ...[...browserRequests.values()].map((request) => request.promise),
                            ]),
                            new Promise<never>((_, reject) => {
                                timeout = setTimeout(() => {
                                    reject(new Error("Image requests did not finish after reader exit"));
                                }, 10_000);
                            }),
                        ]);
                        assert.equal(requests.size, 0);
                        assert.equal(browserRequests.size, 0);
                    } finally {
                        clearTimeout(timeout);
                    }
                    const releasedProbes = new Map(await resources.evaluate((state) => [...state.releasedProbes]));
                    expectedErrors.push(...expectedImageCancellations(failures, releasedProbes));
                } finally {
                    await resources.evaluate((state) => {
                        state.restore();
                    });
                    await resources.dispose();
                    await network.detach();
                    page.off("request", onRequest);
                    page.off("requestfinished", onRequestEnd);
                    page.off("requestfailed", onRequestEnd);
                }
            },
            expectedErrors
        );
    });
}
