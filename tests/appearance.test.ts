/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
    importBooks,
    openBook,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    withPage,
} from "./browser-test-support.ts";

before(startBrowserTests);
after(stopBrowserTests);

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: failed appearance persistence preserves saved values and permits retry`, async () => {
        await withPage(
            delivery,
            async (page) => {
                await page.locator("#toggle-setting-panel").click();
                await page.locator('input[name="appearance-theme"][value="starry"]').check();
                await page.waitForFunction(() =>
                    localStorage.getItem("aura.bookshelf.appearance")?.includes('"starry"')
                );
                const before = await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance"));
                await page.evaluate(() => {
                    // eslint-disable-next-line @typescript-eslint/unbound-method -- 故障注入只拒绝下一次外观写入，其他调用显式绑定原 Storage。
                    const setItem = Storage.prototype.setItem;
                    Storage.prototype.setItem = function (key: string, value: string) {
                        if (key === "aura.bookshelf.appearance") {
                            Storage.prototype.setItem = setItem;
                            throw new DOMException("Test appearance quota exceeded", "QuotaExceededError");
                        }
                        setItem.call(this, key, value);
                    };
                });
                const size = page.locator("#setting-control---book-cover-width");
                await size.press("ArrowRight");
                const error = page.getByRole("dialog", { name: "外观设置未能保存", exact: true });
                await error.waitFor();
                assert.match(await error.innerText(), /存储空间不足/);
                // CSS 默认值在下一次自然布局时解析；等待控件完成恢复后再核对存储仍未变化。
                await page.waitForFunction(
                    () =>
                        document.querySelector<HTMLInputElement>("#setting-control---book-cover-width")?.value === "120"
                );
                assert.equal(await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")), before);
                assert.equal(await size.inputValue(), "120");
                assert.equal(
                    await page
                        .locator("#book-list")
                        .evaluate((element) => element.style.getPropertyValue("--book-cover-width")),
                    ""
                );
                await error.getByRole("button", { name: "知道了", exact: true }).click();
                await size.press("ArrowRight");
                await page.waitForFunction(() =>
                    localStorage.getItem("aura.bookshelf.appearance")?.includes('"121px"')
                );
                assert.equal(await page.evaluate(() => document.documentElement.dataset["theme"]), "starry");
            },
            ["外观设置未能保存"]
        );
    });

    void test(`${delivery}: appearance updates preserve independent tabs, resets and accepted page-exit writes`, async () => {
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("appearance.txt")]);
            const other = await page.context().newPage();
            const diagnostics: string[] = [];
            other.on("console", (message) => {
                if (message.type() === "error" || message.type() === "warning") diagnostics.push(message.text());
            });
            other.on("requestfailed", (request) => diagnostics.push(`Request failed: ${request.url()}`));
            const session = await page.context().newCDPSession(other);
            session.on("Audits.issueAdded", ({ issue }) => diagnostics.push(`DevTools ${issue.code}`));
            await session.send("Audits.enable");

            try {
                await other.goto(page.url());
                await other.locator(".book-open").waitFor();
                await page.locator("#toggle-setting-panel").click();
                await other.locator("#toggle-setting-panel").click();

                // 两个标签先后修改不同字段，第二次提交不能恢复第一个标签的旧值。
                await page.locator('input[name="appearance-theme"][value="starry"]').check();
                await other.waitForFunction(() => document.documentElement.dataset["theme"] === "starry");
                const size = other.locator("#setting-control---book-cover-width");
                await size.press("ArrowRight");
                await page.waitForFunction(() => {
                    const input = document.querySelector<HTMLInputElement>("#setting-control---book-cover-width");
                    return input?.value === "121" && document.documentElement.dataset["theme"] === "starry";
                });

                // 持有真正的同源锁，让两个标签在存储旧值相同时排队；释放后仍须保留全部独立字段。
                const barrier = await page.evaluateHandle(() => {
                    const state = { granted: false, release: (): void => undefined };
                    void navigator.locks.request("aura.bookshelf.appearance", async () => {
                        state.granted = true;
                        await new Promise<void>((resolve) => {
                            state.release = resolve;
                        });
                    });
                    return state;
                });
                try {
                    await page.waitForFunction((state) => state.granted, barrier);
                    await page.locator('input[name="appearance-theme"][value="breeze"]').check();
                    for (let index = 0; index < 3; index++) await size.press("ArrowRight");
                    await page.locator("#setting > header").press("ArrowLeft");
                    assert.equal(await size.inputValue(), "124");
                } finally {
                    await barrier.evaluate((state) => {
                        state.release();
                    });
                    await barrier.dispose();
                }
                await other.waitForFunction(() => {
                    const input = document.querySelector<HTMLInputElement>("#setting-control---book-cover-width");
                    return (
                        input?.value === "124" &&
                        document.documentElement.dataset["theme"] === "breeze" &&
                        document.querySelector("#setting")?.hasAttribute("data-panel-positioned")
                    );
                });
                const saved = await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance"));
                assert(saved);
                assert(saved.includes('"theme":"breeze"'));
                assert(saved.includes('"--book-cover-width":"124px"'));
                assert(saved.includes('"settings":{'));

                // 常规重置保留最新主题，布局与普通设置一起删除，并同步到另一标签。
                await page.locator("#setting .reset-general").click();
                await other.waitForFunction(() => {
                    const input = document.querySelector<HTMLInputElement>("#setting-control---book-cover-width");
                    return (
                        input?.value === "120" &&
                        document.documentElement.dataset["theme"] === "breeze" &&
                        !document.querySelector("#setting")?.hasAttribute("data-panel-positioned")
                    );
                });

                // 完整重置和随后输入使用同一顺序，不把重置当成从旧内存快照开始的整页覆盖。
                await page.locator("#setting .reset").click();
                await other.waitForFunction(() => document.documentElement.dataset["theme"] === "sunny");
                await size.press("ArrowRight");
                await page.waitForFunction(() =>
                    localStorage.getItem("aura.bookshelf.appearance")?.includes('"121px"')
                );

                // 页面销毁只结束呈现，已接受的设置写入仍完成；重新进入时从持久化恢复。
                const exitBarrier = await other.evaluateHandle(() => {
                    const state = { granted: false, release: (): void => undefined };
                    void navigator.locks.request("aura.bookshelf.appearance", async () => {
                        state.granted = true;
                        await new Promise<void>((resolve) => {
                            state.release = resolve;
                        });
                    });
                    return state;
                });
                try {
                    await other.waitForFunction((state) => state.granted, exitBarrier);
                    await page.locator("#setting-control---book-cover-width").press("ArrowRight");
                    await page.locator("#setting .close").click();
                    await openBook(page, "appearance.txt");
                } finally {
                    await exitBarrier.evaluate((state) => {
                        state.release();
                    });
                    await exitBarrier.dispose();
                }
                await other.waitForFunction(() =>
                    localStorage.getItem("aura.bookshelf.appearance")?.includes('"122px"')
                );
                await page.locator("#return-bookshelf").click();
                await page.locator(".book-open").waitFor();
                await page.locator("#toggle-setting-panel").click();
                assert.equal(await page.locator("#setting-control---book-cover-width").inputValue(), "122");

                // 阅读器的工具栏和常规设置共用同一快照；外部重置必须同时刷新两者。
                await page.locator("#setting .close").click();
                await other.locator("#setting .close").click();
                await openBook(page, "appearance.txt");
                await openBook(other, "appearance.txt");
                await other.locator("#toggle-setting-panel").click();
                await page.locator(".reader-tools-toggle").click();
                await other.waitForFunction(() =>
                    document.querySelector("#reader-actions")?.hasAttribute("data-collapsed")
                );
                await other.locator("#setting-control-font-size").press("ArrowRight");
                await page.waitForFunction(() => {
                    const saved = localStorage.getItem("aura.reader.appearance");
                    return saved?.includes('"font-size"') && saved.includes('"collapsed":true');
                });
                await other.locator("#setting .reset-general").click();
                await page.waitForFunction(() => {
                    const saved = localStorage.getItem("aura.reader.appearance");
                    return (
                        !document.querySelector("#reader-actions")?.hasAttribute("data-collapsed") &&
                        saved?.includes('"theme":"paper"') &&
                        !saved.includes('"font-size"')
                    );
                });
                assert(
                    await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")?.includes('"122px"'))
                );
                assert.deepEqual(diagnostics, []);
            } finally {
                await other.close();
            }
        });
    });
}
