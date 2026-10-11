/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, before, test } from "node:test";
import type { Page } from "playwright-core";
import type Progress from "../src/domain/progress/progress.ts";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";
import {
    importBooks,
    openBook,
    setMode,
    settleReader,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    waitForChapterLayout,
    withPage,
} from "./browser-test-support.ts";

before(startBrowserTests);
after(stopBrowserTests);

/**
 * 读取实际显示的正文，不能只用保存记录或页码证明画面恢复。
 */
async function readVisiblePage(page: Page): Promise<{ text: string; firstTop: number | undefined }> {
    return page.locator("#content > .reading-viewport:not(.reading-measure-viewport) p").evaluateAll((paragraphs) => {
        const viewport = document
            .querySelector("#content > .reading-viewport:not(.reading-measure-viewport)")
            ?.getBoundingClientRect();
        if (!viewport) throw new Error("Missing reading viewport");
        const intersects = (rect: DOMRect): boolean =>
            rect.bottom > viewport.top + 1 &&
            rect.top < viewport.bottom - 1 &&
            rect.right > viewport.left + 1 &&
            rect.left < viewport.right - 1;
        const visible: string[] = [];
        let firstTop: number | undefined;
        const range = document.createRange();
        for (const paragraph of paragraphs) {
            if (![...paragraph.getClientRects()].some(intersects)) continue;
            const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node.textContent ?? "";
                let offset = 0;
                for (const character of text) {
                    range.setStart(node, offset);
                    range.setEnd(node, offset + character.length);
                    const rect = [...range.getClientRects()].find(intersects);
                    if (rect) {
                        firstTop ??= rect.top - viewport.top;
                        visible.push(character);
                    }
                    offset += character.length;
                }
            }
        }
        return { text: visible.join(""), firstTop };
    });
}

/**
 * 仅验证源正文时共用同一可见字符采样，不重复维护段落可见性的另一套定义。
 */
async function readVisibleText(page: Page): Promise<string> {
    return (await readVisiblePage(page)).text;
}

/**
 * 只读取测试上下文通过真实阅读保存的领域记录，不以 DOM 页码代替持久化位置。
 */
async function readProgress(page: Page): Promise<Progress[]> {
    return page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("aura");
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Unable to open the test database"));
            };
        });
        try {
            return await new Promise<Progress[]>((resolve, reject) => {
                const request = database.transaction("progress").objectStore("progress").getAll() as IDBRequest<
                    Progress[]
                >;
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(request.error ?? new Error("Unable to read the saved progress"));
                };
            });
        } finally {
            database.close();
        }
    });
}

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: EPUB links to empty tail anchors retain their source location after reopening`, async () => {
        for (const mode of ["none", "scroll"] as const) {
            await withPage(delivery, async (page) => {
                const content = "这是用于验证长段落尾部锚点的正文。".repeat(1600) + "尾部目标";
                await importBooks(page, [
                    {
                        name: "empty-anchor.epub",
                        mimeType: "application/epub+zip",
                        buffer: createEpubFixture(
                            `<p><a href="chapter.xhtml#tail">跳到末尾</a></p><p>${content}<span id="tail"></span></p>`
                        ),
                    },
                ]);
                await openBook(page, "empty-anchor.epub");
                await setMode(page, mode);
                await page.locator('#content a[data-book-fragment="tail"]').click();
                await settleReader(page);

                // 空锚点自身没有像素，验收其前方的真实内容，不能只检查 fragment 或已保存记录。
                const tailVisible = (): Promise<void> =>
                    page
                        .waitForFunction(() => {
                            const viewport = document.querySelector(
                                "#content > .reading-viewport:not(.reading-measure-viewport)"
                            );
                            const bounds = viewport?.getBoundingClientRect();
                            if (!viewport || !bounds) return false;
                            const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT);
                            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                                const offset = node.textContent?.indexOf("尾部目标") ?? -1;
                                if (offset < 0) continue;
                                const range = document.createRange();
                                range.setStart(node, offset);
                                range.setEnd(node, offset + 4);
                                return [...range.getClientRects()].some(
                                    (rect) =>
                                        rect.right > bounds.left &&
                                        rect.left < bounds.right &&
                                        rect.bottom > bounds.top &&
                                        rect.top < bounds.bottom
                                );
                            }
                            return false;
                        })
                        .then(() => undefined);
                await tailVisible();
                const progress = await readProgress(page);
                assert.equal(progress[0]?.blockNumber, 2);
                assert.equal(progress[0].contentOffset, content.length);

                await page.reload();
                await page.locator("#toggle-setting-panel:not([disabled])").waitFor();
                await settleReader(page);
                await tailVisible();
                assert.deepEqual(await readProgress(page), progress);

                if (mode === "scroll") {
                    // 恢复只保留原锚点；真实滚动仍须立即接受新位置，重入不能再退到临时片段行首。
                    const previousRate = await page.locator("#progress-rate").textContent();
                    await page.locator("#content").hover();
                    await page.mouse.wheel(0, -180);
                    await page.waitForFunction(
                        (rate) => document.querySelector("#progress-rate")?.textContent !== rate,
                        previousRate
                    );
                    const scrolled = await readProgress(page);
                    assert.notDeepEqual(scrolled, progress);
                    await page.reload();
                    await page.locator("#toggle-setting-panel:not([disabled])").waitFor();
                    await settleReader(page);
                    assert.deepEqual(await readProgress(page), scrolled);
                }
            });
        }
    });

    void test(`${delivery}: EPUB table links retain their source position through reflow and manual scrolling`, async () => {
        const rows = Array.from(
            { length: 80 },
            (_, row) =>
                "<tr>" +
                Array.from(
                    { length: 8 },
                    (_, column) =>
                        `<td>${row === 60 && column === 6 ? '<span id="target">定位目标</span>' : `行${String(row)}列${String(column)}`}${"这是表格正文。".repeat(3)}</td>`
                ).join("") +
                "</tr>"
        ).join("");
        for (const mode of ["none", "scroll"] as const) {
            await withPage(delivery, async (page) => {
                await importBooks(page, [
                    {
                        name: "table-position.epub",
                        mimeType: "application/epub+zip",
                        buffer: createEpubFixture(
                            `<p><a href="chapter.xhtml#target">跳到表格</a></p><table><tbody>${rows}</tbody></table>`
                        ),
                    },
                ]);
                await openBook(page, "table-position.epub");
                await setMode(page, mode);
                await page.locator('#content a[data-book-fragment="target"]').click();
                await settleReader(page);
                const progress = await readProgress(page);

                // 同时核对正文视窗和表格内部裁切，不能把屏外 Range 或只正确的进度记录当成成功。
                const assertTargetVisible = async (): Promise<void> => {
                    const visible = await page
                        .locator("#content")
                        .getByText("定位目标", { exact: true })
                        .evaluate((target) => {
                            const bounds = target.closest(".reading-viewport")?.getBoundingClientRect();
                            if (!bounds) return false;
                            const rect = target.getBoundingClientRect();
                            const x = Math.max(bounds.left + 1, Math.min(bounds.right - 1, rect.left + rect.width / 2));
                            const y = Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, rect.top + rect.height / 2));
                            return (
                                rect.right > bounds.left &&
                                rect.left < bounds.right &&
                                rect.bottom > bounds.top &&
                                rect.top < bounds.bottom &&
                                target.contains(document.elementFromPoint(x, y))
                            );
                        });
                    assert(visible, "The linked table cell must remain visible");
                };
                await assertTargetVisible();
                for (const [width, height] of [
                    [880, 660],
                    [650, 450],
                    [1000, 780],
                    [1440, 900],
                ] as const) {
                    await page.setViewportSize({ width, height });
                    await settleReader(page);
                    assert.deepEqual(await readProgress(page), progress);
                    await assertTargetVisible();
                }
                await page.reload();
                await page.locator("#toggle-setting-panel:not([disabled])").waitFor();
                await settleReader(page);
                assert.deepEqual(await readProgress(page), progress);
                await assertTargetVisible();

                if (mode === "none") {
                    // 程序恢复不采样新行首；用户随后滚动内嵌表格仍须更新并持久保存位置。
                    await page.locator("#content table").hover();
                    const scrollTop = await page.locator("#content table").evaluate((table) => table.scrollTop);
                    await page.mouse.wheel(0, -240);
                    await page.waitForFunction(
                        (previous) => (document.querySelector("#content table")?.scrollTop ?? previous) < previous,
                        scrollTop
                    );
                    await page.locator("#return-bookshelf").click();
                    await page.locator("#bookshelf").waitFor();
                    const scrolled = await readProgress(page);
                    assert.notDeepEqual(scrolled, progress);
                    await openBook(page, "table-position.epub");
                    assert.deepEqual(await readProgress(page), scrolled);
                }
            });
        }
    });

    void test(`${delivery}: long chapters retain deep source positions while layout is pending`, async () => {
        await withPage(delivery, async (page) => {
            const book = textBook("windowed-progress.txt", 1, 6000);
            // 空物理行仍属于源位置，排版批次碰到零高段落也不能丢失章节前缀。
            book.buffer = Buffer.from(
                book.buffer
                    .toString("utf8")
                    .split("\n")
                    .map((line, index) => (index > 0 && index % 64 === 1 ? "" : line))
                    .join("\n")
            );
            await importBooks(page, [book]);
            await openBook(page, "windowed-progress.txt");
            await setMode(page, "scroll");
            await page.locator("#content > .reading-viewport:not(.reading-measure-viewport)").evaluate((viewport) => {
                viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * 0.75;
            });
            await page.waitForFunction(
                () => Number.parseFloat(document.querySelector("#progress-rate")?.textContent ?? "0") > 30
            );
            const progress = await readProgress(page);
            const anchor = progress[0];
            assert(anchor && anchor.blockNumber > 2000);

            // 连续有效输入和模式切换保留同一源位置，不要求后台全章排版先完成。
            await page.locator("#toggle-setting-panel").click();
            for (const fontSize of [22, 25, 18, 23]) {
                await page.locator("#setting-control-font-size").fill(String(fontSize));
                assert.equal(
                    await page.locator("#content").evaluate((content) => getComputedStyle(content).fontSize),
                    `${String(fontSize)}px`
                );
            }
            for (const mode of ["cover", "scroll", "none"]) {
                await page.locator(`input[name="reading-mode"][value="${mode}"]`).check();
                await page.waitForFunction(
                    (expected) => document.querySelector("#content")?.getAttribute("data-reading-mode") === expected,
                    mode
                );
            }
            await page.locator("#setting .close").click();
            await settleReader(page);
            assert.deepEqual(await readProgress(page), progress);

            // 在用户可见的排版进行状态中离页；重入必须读到离开时的源锚点。
            await page.locator('#page-position[aria-busy="true"]').waitFor();
            await page.locator("#return-bookshelf").click();
            await page.locator("#bookshelf").waitFor();
            assert.equal(await page.locator(".reading-measure-viewport").count(), 0);
            await openBook(page, "windowed-progress.txt");
            assert.deepEqual(await readProgress(page), progress);
            assert.equal(
                await page.locator("#content").evaluate((content) => getComputedStyle(content).fontSize),
                "23px"
            );
            await page.waitForFunction((blockNumber) => {
                const viewport = document.querySelector("#content > .reading-viewport:not(.reading-measure-viewport)");
                const bounds = viewport?.getBoundingClientRect();
                if (!viewport || !bounds) return false;
                return [...viewport.querySelectorAll<HTMLElement>("[data-block-number]")].some(
                    (block) =>
                        Number(block.dataset["blockNumber"]) === blockNumber &&
                        [...block.getClientRects()].some(
                            (rect) =>
                                rect.right > bounds.left + 1 &&
                                rect.left < bounds.right - 1 &&
                                rect.bottom > bounds.top + 1 &&
                                rect.top < bounds.bottom - 1
                        )
                );
            }, anchor.blockNumber);

            // 未知全章页号不能被解释为章首页；显式向前后，索引提交也不能覆盖新位置。
            await page.locator('#page-position[aria-busy="true"]').waitFor();
            await page.locator("#content").press("ArrowRight");
            await settleReader(page);
            const advanced = await readProgress(page);
            assert(advanced[0] && advanced[0].blockNumber > anchor.blockNumber);
            assert(advanced[0].blockNumber < anchor.blockNumber + 100);
            await waitForChapterLayout(page);
            assert.deepEqual(await readProgress(page), advanced);
            assert.match(
                (await page.locator("#page-position").getAttribute("aria-label")) ?? "",
                /第 \d+ 页，共 \d+ 页/
            );
            const pages = (await page.locator("#page-position").getAttribute("aria-label"))?.match(/\d+/g);
            assert(pages && Number(pages[0]) > 1 && Number(pages[0]) <= Number(pages[1]));
        });
    });

    void test(`${delivery}: viewport reflow preserves the source anchor until explicit navigation`, async () => {
        const books = [
            textBook("reflow-progress.txt", 3, 240),
            {
                name: "reflow-progress.epub",
                mimeType: "application/epub+zip",
                buffer: createEpubFixture(
                    Array.from(
                        { length: 240 },
                        (_, index) =>
                            `<p>段落${String(index).padStart(4, "0")} ${"正文用于验证翻页后重排的内容与段间留白。".repeat(12)}</p>`
                    ).join("")
                ),
            },
        ];
        for (const book of books) {
            await withPage(delivery, async (page) => {
                await importBooks(page, [book]);
                await openBook(page, book.name);
                for (const mode of ["cover", "slide", "none"] as const) {
                    await setMode(page, mode);
                    for (let index = 0; index < (book.name.endsWith(".epub") ? 2 : 7); index++) {
                        await page.locator("#content").press("ArrowRight");
                        await settleReader(page);
                    }
                    await waitForChapterLayout(page);
                    const progress = await readProgress(page);
                    const position = await page.locator("#page-position").getAttribute("aria-label");
                    const visiblePage = await readVisiblePage(page);
                    const visibleText = visiblePage.text;
                    assert(visibleText);
                    assert(visiblePage.firstTop !== undefined);

                    // 连续跨越工具布局与正文留白的断点，并反向恢复；每个中间状态都不得改写源锚点。
                    for (let round = 0; round < 2; round++) {
                        for (const width of [1000, 801, 800, 601, 600, 390, 600, 601, 800, 801, 1000, 1440]) {
                            await page.setViewportSize({ width, height: 900 });
                            await settleReader(page);
                            assert.deepEqual(await readProgress(page), progress, `${mode}, width ${String(width)}`);
                            const reflowed = await readVisiblePage(page);
                            assert.equal(reflowed.text.slice(0, 24), visibleText.slice(0, 24));
                            assert(reflowed.firstTop !== undefined);
                            assert(
                                Math.abs(reflowed.firstTop - visiblePage.firstTop) < 0.5,
                                `${book.name}, ${mode}, width ${String(width)}: first line ${String(visiblePage.firstTop)} -> ${String(reflowed.firstTop)}`
                            );
                        }
                        await waitForChapterLayout(page);
                        assert.equal(await page.locator("#page-position").getAttribute("aria-label"), position);
                        assert.equal(await readVisibleText(page), visibleText);
                    }
                    await page.reload();
                    await page
                        .locator("#content > .reading-viewport:not(.reading-measure-viewport) .reading-chapter")
                        .waitFor();
                    await waitForChapterLayout(page);
                    assert.deepEqual(await readProgress(page), progress);
                    assert.equal(await page.locator("#page-position").getAttribute("aria-label"), position);
                    assert.equal(await readVisibleText(page), visibleText);
                    const reloaded = await readVisiblePage(page);
                    assert(reloaded.firstTop !== undefined);
                    assert(
                        Math.abs(reloaded.firstTop - visiblePage.firstTop) < 0.5,
                        `${book.name}, ${mode}: reload first line ${String(visiblePage.firstTop)} -> ${String(reloaded.firstTop)}`
                    );

                    // 冻结只属于重排；真实的向前和向后阅读仍须更新并恢复持久化进度。
                    await page.locator("#content").press("ArrowRight");
                    await settleReader(page);
                    assert.notDeepEqual(await readProgress(page), progress);
                    await page.locator("#content").press("ArrowLeft");
                    await settleReader(page);
                    assert.deepEqual(await readProgress(page), progress);
                }
            });
        }
    });

    void test(`${delivery}: reopening a reader waits for all earlier progress transactions`, async () => {
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("pending-progress.txt", 3, 160)]);
            await openBook(page, "pending-progress.txt");
            await setMode(page, "none");
            await waitForChapterLayout(page);

            // 同源的另一事务占用进度 store，模拟批量数据操作；不修改记录或替换数据库 API。
            await page.evaluate(async () => {
                const database = await new Promise<IDBDatabase>((resolve, reject) => {
                    const request = indexedDB.open("aura");
                    request.onsuccess = () => {
                        resolve(request.result);
                    };
                    request.onerror = () => {
                        reject(request.error ?? new Error("Unable to open the test database"));
                    };
                });
                const transaction = database.transaction("progress", "readwrite");
                const store = transaction.objectStore("progress");
                let holding = true;
                document.addEventListener(
                    "release-progress-store",
                    () => {
                        holding = false;
                    },
                    { once: true }
                );
                const retain = (): void => {
                    if (holding) store.get("pending-progress-lock").onsuccess = retain;
                };
                transaction.oncomplete = () => {
                    database.close();
                };
                retain();
            });

            // 保存等待数据库时仍可连续阅读；浏览器历史退出不经过页内“返回书架”的等待路径。
            for (let index = 0; index < 2; index++) {
                await page.locator("#content").press("ArrowRight");
                await settleReader(page);
            }
            const position = await page.locator("#page-position").getAttribute("aria-label");
            const visibleText = await readVisibleText(page);
            assert.match(position ?? "", /第 3 页/);
            assert(visibleText);
            await page.goBack();
            await page.locator("#bookshelf").waitFor();
            await page.goForward();
            await page.locator("#reader").waitFor();
            await page.evaluate(() => {
                document.dispatchEvent(new Event("release-progress-store"));
            });

            // 新会话必须读到离开前的最终位置；再次刷新也不能把中间位置写回。
            await page
                .locator("#content > .reading-viewport:not(.reading-measure-viewport) .reading-chapter")
                .waitFor();
            await waitForChapterLayout(page);
            assert.equal(await page.locator("#page-position").getAttribute("aria-label"), position);
            assert.equal(await readVisibleText(page), visibleText);
            await page.reload();
            await page
                .locator("#content > .reading-viewport:not(.reading-measure-viewport) .reading-chapter")
                .waitFor();
            await waitForChapterLayout(page);
            assert.equal(await page.locator("#page-position").getAttribute("aria-label"), position);
            assert.equal(await readVisibleText(page), visibleText);
        });
    });
}
