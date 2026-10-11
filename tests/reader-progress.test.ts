/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, before, test } from "node:test";
import type { Page } from "playwright-core";
import type Progress from "../src/domain/progress/progress.ts";
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
async function readVisibleText(page: Page): Promise<string | null | undefined> {
    return page.locator("#content > .reading-viewport:not(.reading-measure-viewport) p").evaluateAll((paragraphs) => {
        const viewport = document
            .querySelector("#content > .reading-viewport:not(.reading-measure-viewport)")
            ?.getBoundingClientRect();
        if (!viewport) throw new Error("Missing reading viewport");
        return paragraphs.find((paragraph) =>
            [...paragraph.getClientRects()].some(
                (rect) =>
                    rect.bottom > viewport.top + 1 &&
                    rect.top < viewport.bottom - 1 &&
                    rect.right > viewport.left + 1 &&
                    rect.left < viewport.right - 1
            )
        )?.textContent;
    });
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
            await page.locator("#next-page").click();
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
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("reflow-progress.txt", 3, 240)]);
            await openBook(page, "reflow-progress.txt");
            for (const mode of ["cover", "slide", "none"] as const) {
                await setMode(page, mode);
                for (let index = 0; index < 7; index++) {
                    await page.locator("#next-page").click();
                    await settleReader(page);
                }
                await waitForChapterLayout(page);
                const progress = await readProgress(page);
                const position = await page.locator("#page-position").getAttribute("aria-label");
                const visibleText = await readVisibleText(page);
                assert(visibleText);

                // 连续跨越工具布局与正文留白的断点，并反向恢复；每个中间状态都不得改写源锚点。
                for (let round = 0; round < 2; round++) {
                    for (const width of [1000, 801, 800, 601, 600, 390, 600, 601, 800, 801, 1000, 1440]) {
                        await page.setViewportSize({ width, height: 900 });
                        await settleReader(page);
                        assert.deepEqual(await readProgress(page), progress, `${mode}, width ${String(width)}`);
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

                // 冻结只属于重排；真实的向前和向后阅读仍须更新并恢复持久化进度。
                await page.locator("#next-page").click();
                await settleReader(page);
                assert.notDeepEqual(await readProgress(page), progress);
                await page.locator("#previous-page").click();
                await settleReader(page);
                assert.deepEqual(await readProgress(page), progress);
            }
        });
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
                await page.locator("#next-page").click();
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
