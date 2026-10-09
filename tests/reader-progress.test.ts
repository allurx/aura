/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
    importBooks,
    openBook,
    setMode,
    settleReader,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    withPage,
} from "./browser-test-support.ts";

before(startBrowserTests);
after(stopBrowserTests);

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: reopening a reader waits for all earlier progress transactions`, async () => {
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("pending-progress.txt", 3, 160)]);
            await openBook(page, "pending-progress.txt");
            await setMode(page, "none");

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
            const readVisibleText = () =>
                page.locator("#content p").evaluateAll((paragraphs) => {
                    const viewport = document.querySelector(".reading-viewport")?.getBoundingClientRect();
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
            const position = await page.locator("#page-position").getAttribute("aria-label");
            const visibleText = await readVisibleText();
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
            await page.locator("#content .reading-chapter").waitFor();
            await settleReader(page);
            assert.equal(await page.locator("#page-position").getAttribute("aria-label"), position);
            assert.equal(await readVisibleText(), visibleText);
            await page.reload();
            await page.locator("#content .reading-chapter").waitFor();
            await settleReader(page);
            assert.equal(await page.locator("#page-position").getAttribute("aria-label"), position);
            assert.equal(await readVisibleText(), visibleText);
        });
    });
}
