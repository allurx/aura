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
    void test(`${delivery}: bookshelf defaults suit the opening layout and preserve saved choices`, async () => {
        await withPage(delivery, async (page) => {
            const appearance = () =>
                page.evaluate(() => ({
                    theme: document.documentElement.dataset["theme"],
                    material: document.documentElement.dataset["material"],
                }));
            assert.deepEqual(await appearance(), { theme: "sunny", material: "wood" });

            // 配色在本次页面会话内稳定，新进入窄屏页面时才选用对应默认。
            await page.setViewportSize({ width: 390, height: 844 });
            assert.deepEqual(await appearance(), { theme: "sunny", material: "wood" });
            await page.reload();
            await page.locator(".shelf-empty-import").waitFor();
            assert.deepEqual(await appearance(), { theme: "sunny", material: "standard" });
            assert.equal(await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")), null);

            // 显式选择由原有整页快照保存，换布局或刷新不替换为新的默认值。
            await page.locator("#toggle-setting-panel").click();
            await page.locator('input[name="appearance-theme"][value="blossom"]').check();
            await page.getByText("材质与纹理", { exact: true }).click();
            await page.locator('input[name="appearance-material"][value="wood"]').check();
            await page.getByRole("slider", { name: "封面大小", exact: true }).fill("160");
            await page.locator("#setting .close").click();
            const saved = await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance"));

            await page.setViewportSize({ width: 1440, height: 900 });
            await page.reload();
            await page.locator(".shelf-empty-import").waitFor();
            assert.deepEqual(await appearance(), { theme: "blossom", material: "wood" });
            assert.equal(await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")), saved);
            assert.equal(
                await page
                    .locator("#book-list")
                    .evaluate((element) => element.style.getPropertyValue("--book-cover-width")),
                "160px"
            );
        });
    });

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
                const error = page.getByRole("dialog", { name: "外观保存失败", exact: true });
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
            ["外观保存失败"]
        );
    });

    void test(`${delivery}: reader webpage color stays independent of paper, theme, material and bookshelf`, async () => {
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("webpage-color.txt")]);
            const bookshelfBackground = await page
                .locator("#bookshelf")
                .evaluate((element) => getComputedStyle(element).backgroundColor);
            const bookshelfAppearance = await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance"));
            await openBook(page, "webpage-color.txt");
            await page.locator("#toggle-setting-panel").click();
            await page.getByText("阅读配色", { exact: true }).click();
            const webpageColor = page.getByLabel("网页背景颜色", { exact: true });
            const paperColor = page.getByLabel("阅读背景", { exact: true });
            await paperColor.fill("#faf4e8");
            await webpageColor.fill("#123456");

            const readColors = () =>
                page.evaluate(() => {
                    const app = document.querySelector("#app");
                    const reader = document.querySelector("#reader");
                    if (!app || !reader) throw new Error("Missing reader surfaces");
                    return {
                        webpage: getComputedStyle(app).backgroundColor,
                        image: getComputedStyle(app).backgroundImage,
                        paper: getComputedStyle(reader).backgroundColor,
                        root: getComputedStyle(document.documentElement).backgroundColor,
                    };
                });
            const explicitColors = {
                webpage: "rgb(18, 52, 86)",
                image: "none",
                paper: "rgb(250, 244, 232)",
                root: "rgb(18, 52, 86)",
            };
            assert.deepEqual(await readColors(), explicitColors);

            // 主题光影与材质底色不能盖住显式网页颜色，背景纹理仍独立生效。
            await page.locator('input[name="appearance-theme"][value="starry"]').check();
            await page.getByText("材质与纹理", { exact: true }).click();
            await page.locator('input[name="appearance-material"][value="metal"]').check();
            assert.deepEqual(await readColors(), explicitColors);
            await page.getByRole("switch", { name: "网页背景纹理", exact: true }).check();
            const texturedColors = await readColors();
            assert.notEqual(texturedColors.image, "none");
            assert.deepEqual({ ...texturedColors, image: "none" }, explicitColors);
            const saved = await page.evaluate(() => localStorage.getItem("aura.reader.appearance"));
            assert(saved?.includes('"--reader-backdrop":"#123456"'));
            await page.locator("#setting .close").click();
            await page.reload();
            await page.locator("#toggle-setting-panel:not([disabled])").waitFor();
            assert.deepEqual(await readColors(), texturedColors);
            assert.equal(await page.evaluate(() => localStorage.getItem("aura.reader.appearance")), saved);

            // 同一个 SPA 根节点切回书架后不读取 Reader 的网页色，书库和两页偏好互不覆盖。
            await page.locator("#return-bookshelf").click();
            await page.locator(".book-open").waitFor();
            assert.equal(
                await page.locator("#bookshelf").evaluate((element) => getComputedStyle(element).backgroundColor),
                bookshelfBackground
            );
            assert.equal(
                await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")),
                bookshelfAppearance
            );
            await openBook(page, "webpage-color.txt");
            assert.deepEqual(await readColors(), texturedColors);
            await page.locator("#toggle-setting-panel").click();
            await page.getByText("阅读配色", { exact: true }).click();

            // 单项重置恢复当前主题与材质，保留纸面；页面重置清除网页色并恢复默认主题。
            await page.getByRole("button", { name: "重置网页背景颜色", exact: true }).click();
            assert.equal(
                await page.evaluate(() => document.documentElement.style.getPropertyValue("--reader-backdrop")),
                ""
            );
            assert.equal((await readColors()).paper, explicitColors.paper);
            assert.notEqual((await readColors()).webpage, explicitColors.webpage);
            await webpageColor.fill("#234567");
            await page.locator("#setting .reset-general").click();
            assert.equal(await page.evaluate(() => document.documentElement.dataset["theme"]), "starry");
            assert.equal(
                await page.evaluate(() => document.documentElement.style.getPropertyValue("--reader-backdrop")),
                ""
            );
            await webpageColor.fill("#345678");
            await page.locator("#setting .reset").click();
            assert.equal(await page.evaluate(() => document.documentElement.dataset["theme"]), "paper");
            assert.equal(
                await page.evaluate(() => document.documentElement.style.getPropertyValue("--reader-backdrop")),
                ""
            );
            assert.equal(await page.evaluate(() => localStorage.getItem("aura.reader.appearance")), null);
        });
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
