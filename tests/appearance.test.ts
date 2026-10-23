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
    void test(`${delivery}: continuous setting input keeps reset controls in place`, async () => {
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("setting-geometry.txt")]);
            for (const pageName of ["bookshelf", "reader"] as const) {
                if (pageName === "reader") await openBook(page, "setting-geometry.txt");
                await page.locator("#toggle-setting-panel").click();
                const cases =
                    pageName === "bookshelf"
                        ? [{ name: "书名字号", start: "16", steps: 10 }]
                        : [
                              { name: "字号", start: "16", steps: 10 },
                              { name: "行距", start: "1.9", steps: 10 },
                              { name: "页边留白", start: "0.99", steps: 2 },
                          ];
                for (const width of [1440, 390]) {
                    await page.setViewportSize({ width, height: 900 });
                    for (const { name, start, steps } of cases) {
                        const slider = page.getByRole("slider", { name, exact: true });
                        const reset = page.getByRole("button", { name: `重置${name}`, exact: true });
                        await slider.fill(start);
                        await slider.focus();
                        const samples = [];
                        for (let index = 0; index <= steps; index++) {
                            if (index > 0) await slider.press("ArrowRight");
                            samples.push(
                                await reset.evaluate(async (button) => {
                                    await new Promise<void>((resolve) =>
                                        requestAnimationFrame(() => {
                                            resolve();
                                        })
                                    );
                                    const row = button.parentElement;
                                    if (!row) throw new Error("Missing setting row");
                                    const bounds = button.getBoundingClientRect();
                                    const parent = row.getBoundingClientRect();
                                    const style = getComputedStyle(button);
                                    return {
                                        x: bounds.left - parent.left,
                                        y: bounds.top - parent.top,
                                        width: bounds.width,
                                        height: bounds.height,
                                        visible: style.visibility === "visible" && Number(style.opacity) > 0,
                                        value: row.querySelector(".display")?.textContent,
                                    };
                                })
                            );
                        }
                        const first = samples[0];
                        assert(first);
                        assert(
                            new Set(samples.map((sample) => sample.value?.length)).size > 1,
                            `${name}: exercise changing label widths`
                        );
                        for (const sample of samples) {
                            assert(
                                sample.visible && sample.width > 0 && sample.height > 0,
                                `${name}: reset remains visible`
                            );
                            assert(
                                Math.abs(sample.x - first.x) <= 1 && Math.abs(sample.y - first.y) <= 1,
                                `${pageName}/${width}/${name}: reset moved during input: ${JSON.stringify(samples)}`
                            );
                        }
                        await reset.click();
                        await page.waitForFunction(
                            (name) =>
                                document.querySelector(`[aria-label="重置${name}"]`)?.getAttribute("aria-disabled") ===
                                "true",
                            name
                        );
                        assert.equal(await reset.getAttribute("aria-disabled"), "true");
                        assert(await slider.evaluate((element) => element === document.activeElement));
                    }
                }
                await page.locator("#setting .close").click();
                await page.setViewportSize({ width: 1440, height: 900 });
            }
        });
    });

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

    void test(`${delivery}: page appearance persists through reopening and resets only its intended scope`, async () => {
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("appearance.txt")]);
            await page.locator("#toggle-setting-panel").click();
            await page.locator('input[name="appearance-theme"][value="breeze"]').check();
            const size = page.locator("#setting-control---book-cover-width");
            for (let index = 0; index < 3; index++) await size.press("ArrowRight");
            await page.locator("#setting > header").press("ArrowLeft");
            const bookshelfAppearance = await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance"));
            assert(bookshelfAppearance);
            assert(bookshelfAppearance.includes('"123px"'));
            assert(bookshelfAppearance.includes('"settings":{'));

            // 关闭与导航保留即时保存的值，刷新后恢复当前页面快照。
            await page.locator("#setting .close").click();
            await openBook(page, "appearance.txt");
            await page.locator("#return-bookshelf").click();
            await page.locator(".book-open").waitFor();
            await page.reload();
            await page.locator(".book-open").waitFor();
            await page.locator("#toggle-setting-panel").click();
            assert.equal(await size.inputValue(), "123");
            assert.equal(await page.evaluate(() => document.documentElement.dataset["theme"]), "breeze");
            assert.equal(await page.locator("#setting").getAttribute("data-panel-positioned"), "");
            assert.equal(
                await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")),
                bookshelfAppearance
            );

            // 常规重置包括布局并保留主题，完整重置再恢复当前页面主题。
            await page.locator("#setting .reset-general").click();
            await page.waitForFunction(
                () => document.querySelector<HTMLInputElement>("#setting-control---book-cover-width")?.value === "120"
            );
            assert.equal(await page.evaluate(() => document.documentElement.dataset["theme"]), "breeze");
            assert.equal(await page.locator("#setting").getAttribute("data-panel-positioned"), null);
            await page.locator("#setting .reset").click();
            assert.equal(await page.evaluate(() => document.documentElement.dataset["theme"]), "sunny");
            assert.equal(await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")), null);
            await size.press("ArrowRight");
            await page.locator("#setting .close").click();

            // 阅读页的重置覆盖工具栏和面板，同时保留书架偏好与书籍。
            await openBook(page, "appearance.txt");
            await page.locator("#toggle-setting-panel").click();
            const fontSize = page.locator("#setting-control-font-size");
            const defaultFontSize = await fontSize.inputValue();
            await page.locator("#setting .close").click();
            await page.locator(".reader-tools-toggle").click();
            await page.locator("#reader-actions[data-collapsed]").waitFor();
            await page.reload();
            await page.locator("#reader-actions[data-collapsed]").waitFor();
            await page.locator("#toggle-setting-panel:not([disabled])").waitFor({ state: "attached" });
            await page.locator(".reader-tools-toggle").click();
            await page.locator("#toggle-setting-panel").click();
            await fontSize.fill(String(Number(defaultFontSize) + 1));
            await page.locator("#setting > header").press("ArrowLeft");
            await page.locator("#setting .reset-general").click();
            await page.waitForFunction(
                (value) => document.querySelector<HTMLInputElement>("#setting-control-font-size")?.value === value,
                defaultFontSize
            );
            assert.equal(await page.locator("#setting").getAttribute("data-panel-positioned"), null);
            assert.equal(await page.locator(".reader-tools-toggle").getAttribute("aria-expanded"), "true");
            const readerAppearance = await page.evaluate(() => localStorage.getItem("aura.reader.appearance"));
            assert(readerAppearance);
            assert(readerAppearance.includes('"theme":"paper"'));
            assert(!readerAppearance.includes('"font-size"'));
            assert(!readerAppearance.includes('"toolbar"'));
            assert(await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")?.includes('"121px"')));
            await page.locator("#setting .close").click();
            await page.locator("#return-bookshelf").click();
            await page.locator(".book-open").waitFor();
        });
    });
}
