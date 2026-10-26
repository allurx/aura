/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import {
    importBooks,
    openBook,
    selectChapter,
    setMode,
    setReaderFontSize,
    settleReader,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    waitForBookCount,
    waitForChapterLayout,
    withPage,
} from "./browser-test-support.ts";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";

before(startBrowserTests);
after(stopBrowserTests);

for (const delivery of ["web", "portable"] as const) {
    void test(`${delivery}: result interaction finishes native composition without overriding renewed editing`, async () => {
        await withPage(delivery, async (page) => {
            await importBooks(page, [textBook("候选目标.txt"), textBook("另一书籍.txt")]);

            // 重放真机观察到的事件顺序，保护查询和焦点契约；这不代替 iOS 输入法验收。
            const finishComposition = async (
                inputSelector: string,
                resultsSelector: string,
                query: string,
                options: { explicitInputPointer?: boolean; nextFocus?: string } = {}
            ) =>
                page.evaluate(
                    async ({ inputSelector, resultsSelector, query, explicitInputPointer, nextFocus }) => {
                        const input = document.querySelector(inputSelector);
                        const results = document.querySelector(resultsSelector);
                        if (!(input instanceof HTMLInputElement) || !(results instanceof HTMLElement))
                            throw new Error("Search controls unavailable");

                        input.focus();
                        const previousResults = results.textContent;
                        input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
                        input.value = "uncommitted";
                        input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
                        const retainedCompositionResults = results.textContent === previousResults;
                        const pointer = new PointerEvent("pointerdown", {
                            bubbles: true,
                            cancelable: true,
                            pointerType: "touch",
                        });
                        results.dispatchEvent(pointer);
                        const initiallyBlurred = document.activeElement !== input;

                        // 平台在原生合成提交时恢复输入焦点，然后才发送 compositionend。
                        input.focus();
                        input.value = query;
                        input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, data: query }));
                        if (explicitInputPointer)
                            input.dispatchEvent(
                                new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })
                            );
                        if (nextFocus) {
                            const target = document.querySelector(nextFocus);
                            if (!(target instanceof HTMLElement)) throw new Error("Next focus target unavailable");
                            target.focus();
                        }
                        input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: query }));
                        await Promise.resolve();

                        return {
                            initiallyBlurred,
                            retainedCompositionResults,
                            defaultPrevented: pointer.defaultPrevented,
                            inputFocused: document.activeElement === input,
                            focusId: document.activeElement?.id,
                            value: input.value,
                        };
                    },
                    { inputSelector, resultsSelector, query, ...options }
                );

            const bookshelf = await finishComposition("#book-search", "#book-list", "候选");
            assert.equal(bookshelf.initiallyBlurred, true);
            assert.equal(bookshelf.retainedCompositionResults, true);
            assert.equal(bookshelf.defaultPrevented, false);
            assert.equal(bookshelf.inputFocused, false);
            assert.equal(bookshelf.value, "候选");
            await waitForBookCount(page, 1);
            assert.equal(await page.locator(".book-open").getAttribute("title"), "候选目标.txt");

            // 用户显式回到输入框，或已将焦点交给其他控件时，不再执行旧的结束编辑意图。
            const resumed = await finishComposition("#book-search", "#book-list", "另一", {
                explicitInputPointer: true,
            });
            assert.equal(resumed.inputFocused, true);
            assert.equal(resumed.value, "另一");
            await waitForBookCount(page, 1);
            assert.equal(await page.locator(".book-open").getAttribute("title"), "另一书籍.txt");
            const otherFocus = await finishComposition("#book-search", "#book-list", "候选", {
                nextFocus: "#toggle-setting-panel",
            });
            assert.equal(otherFocus.focusId, "toggle-setting-panel");
            assert.equal(otherFocus.value, "候选");
            await waitForBookCount(page, 1);

            await page.setViewportSize({ width: 390, height: 844 });
            const touch = await page.context().newCDPSession(page);
            await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
            const commitOnNativeRelease = async (
                inputSelector: string,
                resultsSelector: string,
                targetSelector: string,
                query: string
            ) => {
                await page.locator(inputSelector).evaluate((element) => {
                    if (!(element instanceof HTMLInputElement)) throw new Error("Search input unavailable");
                    element.focus();
                    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
                    element.value = "uncommitted";
                    element.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true }));
                });
                const bounds = await page.locator(targetSelector).first().boundingBox();
                assert(bounds);
                const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
                await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
                await page.locator(inputSelector).evaluate((element, query) => {
                    if (!(element instanceof HTMLInputElement)) throw new Error("Search input unavailable");
                    element.focus();
                    element.value = query;
                    element.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, data: query }));
                    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: query }));
                }, query);

                // 先确认原触点下已经换成新结果，再释放同一次原生触摸，覆盖错误点开新结果的场景。
                await page.waitForFunction(
                    ({ x, y, query }) =>
                        document.elementFromPoint(x, y)?.closest("button")?.textContent.includes(query),
                    { ...point, query }
                );
                await page.locator(resultsSelector).evaluate((results) => {
                    if (!(results instanceof HTMLElement)) throw new Error("Search results unavailable");
                    delete results.dataset["nativeRelease"];
                    results.addEventListener(
                        "click",
                        (event) => {
                            if (!(event instanceof MouseEvent)) throw new Error("Expected a native click");
                            results.dataset["nativeRelease"] =
                                event.detail > 0 && event.defaultPrevented ? "blocked" : "allowed";
                        },
                        { capture: true, once: true }
                    );
                });
                await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
                await page.waitForFunction(
                    (selector) => document.querySelector<HTMLElement>(selector)?.dataset["nativeRelease"] !== undefined,
                    resultsSelector
                );
                assert.equal(await page.locator(resultsSelector).getAttribute("data-native-release"), "blocked");
                return point;
            };

            await page.locator("#book-search").fill("");
            await waitForBookCount(page, 2);
            const firstBook = await page.locator(".book-open").first().getAttribute("title");
            const nextBookQuery = firstBook === "候选目标.txt" ? "另一" : "候选";
            const bookPoint = await commitOnNativeRelease("#book-search", "#book-list", ".book-open", nextBookQuery);
            assert.equal(await page.locator("#bookshelf").isVisible(), true);
            assert.equal(await page.locator("#book-search").inputValue(), nextBookQuery);
            await waitForBookCount(page, 1);
            const nextBookTitle = await page.locator(".book-title").innerText();
            await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [bookPoint] });
            await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            await page.locator("#reader").waitFor();
            await settleReader(page);
            assert.equal(await page.locator("#content").getAttribute("aria-label"), `《${nextBookTitle}》正文`);

            if (!(await page.locator("#toggle-toc-panel").isVisible()))
                await page.getByRole("button", { name: "显示阅读工具", exact: true }).press("Enter");
            await page.locator("#toggle-toc-panel").click();
            const toc = await finishComposition("#toc-search", "#toc-chapters", "第2章");
            assert.equal(toc.initiallyBlurred, true);
            assert.equal(toc.retainedCompositionResults, true);
            assert.equal(toc.defaultPrevented, false);
            assert.equal(toc.inputFocused, false);
            assert.equal(toc.value, "第2章");
            const chapter = page.locator("#toc-chapters button[data-chapter-number]");
            await chapter.waitFor();
            assert.equal(await chapter.count(), 1);
            assert.equal(await chapter.innerText(), "第2章 测试章节");

            await page.locator("#toc-search").fill("");
            const chapterPoint = await commitOnNativeRelease(
                "#toc-search",
                "#toc-chapters",
                '#toc-chapters button[data-chapter-number="1"]',
                "第2章"
            );
            assert.equal(await page.locator("#toc[open]").isVisible(), true);
            assert.equal(await page.locator("#toc-search").inputValue(), "第2章");
            await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [chapterPoint] });
            await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            await page.locator("#toc[open]").waitFor({ state: "hidden" });
            await settleReader(page);
            assert.equal(await page.locator("#chapter-title").textContent(), "第2章 测试章节");
        });
    });

    void test(`${delivery}: panel geometry shares appearance persistence and survives viewport constraints`, async () => {
        await withPage(delivery, async (page) => {
            const openSettings = async (): Promise<void> => {
                await page.locator("#toggle-setting-panel").click();
                await page.locator("#setting[open]").waitFor();
            };
            const bounds = () =>
                page.locator("#setting").evaluate((dialog) => {
                    const { left, top, width, height } = dialog.getBoundingClientRect();
                    return { left, top, width, height };
                });
            await openSettings();
            await page.locator("#setting > header").press("ArrowLeft");
            await page.locator("#setting > header").press("Shift+ArrowLeft");
            const savedBounds = await bounds();

            // 常规控件提交与浮层布局共用快照，不能互相覆盖。
            const size = page.getByRole("slider", { name: "封面大小", exact: true });
            await size.press("ArrowRight");
            const savedSize = await size.inputValue();
            // 用已保存的首选值验证响应式夹取，避免将控件显示值当作持久化结果。
            await page.waitForFunction(
                (expected) =>
                    localStorage.getItem("aura.bookshelf.appearance")?.includes(`"--book-cover-width":"${expected}px"`),
                savedSize
            );
            const savedAppearance = await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance"));

            // 跨过浮动几何的 800px 边界及窄屏底部面板，逐次验证约束和关闭重开。
            for (const width of [801, 800, 390, 800, 801]) {
                await page.setViewportSize({ width, height: 600 });
                await page
                    .locator(width > 800 ? "#setting[data-panel-adjustable]" : "#setting:not([data-panel-adjustable])")
                    .waitFor();
                await size.click({ trial: true });
                const constrainedBounds = await bounds();
                assert(
                    constrainedBounds.left >= 0 &&
                        constrainedBounds.top >= 0 &&
                        constrainedBounds.width > 0 &&
                        constrainedBounds.height > 0 &&
                        constrainedBounds.left + constrainedBounds.width <= width &&
                        constrainedBounds.top + constrainedBounds.height <= 600,
                    `Settings panel exceeds the ${String(width)}×600 viewport: ${JSON.stringify(constrainedBounds)}`
                );
                assert.equal(await size.inputValue(), savedSize);
                assert.equal(
                    await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")),
                    savedAppearance
                );

                await page.getByRole("button", { name: "关闭设置", exact: true }).click();
                await page.locator("#setting").waitFor({ state: "hidden" });
                await openSettings();
                assert.deepEqual(await bounds(), constrainedBounds);
                assert.equal(
                    await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")),
                    savedAppearance
                );
            }

            await page.setViewportSize({ width: 1440, height: 900 });
            // 视口命令完成后 resize 回调仍可能未执行，等待面板实际恢复首选几何。
            await page.waitForFunction((expected) => {
                const actual = document.querySelector("#setting")?.getBoundingClientRect();
                return (
                    actual?.left === expected.left &&
                    actual.top === expected.top &&
                    actual.width === expected.width &&
                    actual.height === expected.height
                );
            }, savedBounds);
            assert.deepEqual(await bounds(), savedBounds);
            assert.equal(await page.evaluate(() => localStorage.getItem("aura.bookshelf.appearance")), savedAppearance);

            await page.reload();
            await page.locator(".shelf-empty-import").waitFor();
            await openSettings();
            assert.deepEqual(await bounds(), savedBounds);
            assert.equal(await size.inputValue(), savedSize);

            // 面板单项还原不删除其余外观，也不依赖自定义缩放按钮。
            await page.locator("#setting > header").press("Home");
            assert.notDeepEqual(await bounds(), savedBounds);
            assert.equal(await size.inputValue(), savedSize);
            await page.locator("#setting > header").press("Escape");
            await page.locator("#setting").waitFor({ state: "hidden" });
        });
    });

    void test(`${delivery}: windowed bookshelf keeps offscreen books searchable and readable after deletion`, async () => {
        await withPage(delivery, async (page) => {
            await page.setViewportSize({ width: 900, height: 650 });
            const books = Array.from({ length: 60 }, (_, index) =>
                textBook(`shelf-${String(index).padStart(2, "0")}.txt`)
            );
            await importBooks(page, books);

            // 总数覆盖整批书籍，实际挂载只保留窗口；窗口外书籍仍经正常搜索可达。
            const mounted = await page
                .locator(".book-open")
                .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("title")));
            assert(
                mounted.length > 0 && mounted.length < books.length,
                `Expected a bounded bookshelf, received ${String(mounted.length)} cards`
            );
            const target = books.findLast((book) => !mounted.includes(book.name));
            assert(target);
            await page.locator("#book-search").fill(target.name.replace(/\.txt$/, ""));
            await waitForBookCount(page, 1);
            await openBook(page, target.name);
            await selectChapter(page, 2);
            const readingPercentage = await page.locator("#progress-rate").textContent();
            await page.locator("#return-bookshelf").click();
            await waitForBookCount(page, 1);
            const targetCard = page.locator(".book").filter({ has: page.getByTitle(target.name, { exact: true }) });
            assert.equal(await targetCard.locator(".book-progress").textContent(), readingPercentage);

            // 删除搜索找到的书籍后，其他共享同一原文件的书籍仍可继续阅读。
            await targetCard.locator(".book-more").click();
            await targetCard.locator(".book-delete").click();
            await page
                .getByRole("dialog", { name: "删除书籍", exact: true })
                .getByRole("button", { name: "删除", exact: true })
                .click();
            await waitForBookCount(page, 0);
            await page.locator("#book-search").fill("");
            await waitForBookCount(page, 59);
            const remaining = books.find((book) => book !== target);
            assert(remaining);
            await page.locator("#book-search").fill(remaining.name.replace(/\.txt$/, ""));
            await waitForBookCount(page, 1);
            await openBook(page, remaining.name);
            assert.match((await page.locator("#content").textContent()) ?? "", /这是章节1的第1段/);
        });
    });

    void test(`${delivery}: category moves persist, preserve the previous value on failure and remain discoverable`, async () => {
        await withPage(
            delivery,
            async (page) => {
                await importBooks(page, [textBook("category-target.txt"), textBook("category-neighbor.txt")]);
                const card = page
                    .locator(".book")
                    .filter({ has: page.getByTitle("category-target.txt", { exact: true }) });
                const openCategories = async (): Promise<void> => {
                    await card.locator(".book-more").click();
                    await card.locator(".book-move").click();
                };
                const fiction = card.locator('.book-category-option[data-category-id="fiction"]');
                const collection = card.locator('.book-category-option[data-category-id="collection"]');

                // 成功后关闭浮层；重新加载仍由已保存分类决定当前选项。
                await openCategories();
                assert.equal(await collection.getAttribute("aria-pressed"), "true");
                await fiction.click();
                await card.locator(".book-actions").waitFor({ state: "hidden" });
                await page.reload();
                await waitForBookCount(page, 2);
                await openCategories();
                assert.equal(await fiction.getAttribute("aria-pressed"), "true");

                // 仅使下一次书籍写入失败，验证界面不会把未提交的目标显示成当前归属。
                await page.evaluate(() => {
                    // eslint-disable-next-line @typescript-eslint/unbound-method -- 保留原方法用于还原，调用时用 call 显式传入实际 store。
                    const original = IDBObjectStore.prototype.put;
                    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
                        if (this.name === "book") {
                            IDBObjectStore.prototype.put = original;
                            throw new DOMException("Injected category write failure", "QuotaExceededError");
                        }
                        return original.call(this, value, key);
                    };
                });
                await collection.click();
                const failure = page.getByRole("dialog", { name: "分类未能更改", exact: true });
                await failure.waitFor();
                assert.equal(await fiction.getAttribute("aria-pressed"), "true");
                assert.equal(await collection.getAttribute("aria-pressed"), "false");
                await failure.getByRole("button", { name: "知道了", exact: true }).click();
                await card.locator(".book-more:focus").waitFor();
                await openCategories();
                assert.equal(await fiction.getAttribute("aria-pressed"), "true");
                assert.equal(await collection.getAttribute("aria-pressed"), "false");

                // 刷新核对失败未改写存储，再经相同入口重试。
                await page.reload();
                await waitForBookCount(page, 2);
                await openCategories();
                assert.equal(await fiction.getAttribute("aria-pressed"), "true");
                await collection.click();
                await card.locator(".book-actions").waitFor({ state: "hidden" });
                await page.reload();
                await waitForBookCount(page, 2);

                // 移出当前分类只改变筛选结果，书籍仍能从目标分类找到并打开。
                await page.locator('#category-navigation button[data-id="collection"]').click();
                await waitForBookCount(page, 2);
                await openCategories();
                assert.equal(await collection.getAttribute("aria-pressed"), "true");
                await fiction.click();
                await waitForBookCount(page, 1);
                await card.waitFor({ state: "detached" });
                await page.locator('#category-navigation button[data-id="fiction"]').click();
                await waitForBookCount(page, 1);
                await openBook(page, "category-target.txt");
                assert.match((await page.locator("#content").textContent()) ?? "", /这是章节1的第1段/);
            },
            ["分类未能更改"]
        );
    });

    void test(`${delivery}: shared TXT and EPUB sources survive deletion and export byte for byte`, async () => {
        await withPage(delivery, async (page) => {
            const sources = [
                {
                    name: "original.txt",
                    mimeType: "text/plain",
                    buffer: Buffer.concat([
                        Buffer.from([0xff, 0xfe]),
                        Buffer.from("第一章 原始文件\r\n保留 UTF-16 字节与换行。\r\n", "utf16le"),
                    ]),
                },
                {
                    name: "original.epub",
                    mimeType: "application/epub+zip",
                    buffer: createEpubFixture(
                        '<p><![CDATA[保留正文 <tag> & text]]></p><img src="pixel.png" alt="图片"/>'
                    ),
                },
            ];
            const copies = sources.map((source) => ({ ...source, name: source.name.replace("original", "copy") }));
            await importBooks(page, [...sources, ...copies]);

            // 从真实删除入口移除首份书籍，共享内容仍须支持另一份阅读与原文件导出。
            for (const source of sources) {
                const card = page.locator(".book").filter({ has: page.getByTitle(source.name, { exact: true }) });
                await card.locator(".book-more").click();
                await card.locator(".book-delete").click();
                await page
                    .getByRole("dialog", { name: "删除书籍", exact: true })
                    .getByRole("button", { name: "删除", exact: true })
                    .click();
                await card.waitFor({ state: "detached" });
                await page.locator(".overlay:not([hidden])").waitFor({ state: "hidden" });
            }
            assert.equal(await page.locator(".book").count(), 2);

            for (const copy of copies) {
                await openBook(page, copy.name);
                assert.match((await page.locator("#content").textContent()) ?? "", /保留/);
                await page.locator("#return-bookshelf").click();
                const card = page.locator(".book").filter({ has: page.getByTitle(copy.name, { exact: true }) });
                await card.locator(".book-more").click();
                const pending = page.waitForEvent("download");
                await card.locator(".book-export").click();
                const download = await pending;
                assert.equal(download.suggestedFilename(), copy.name);
                const path = await download.path();
                assert(path);
                assert.deepEqual(await readFile(path), copy.buffer);
            }
        });
    });

    void test(`${delivery}: navigation, layout changes and reload preserve reading content`, async () => {
        await withPage(delivery, async (page) => {
            // 正常动效也必须完成布局，不能等浏览器超时跳过 View Transition 后才继续。
            await page.emulateMedia({ reducedMotion: "no-preference" });
            await importBooks(page, [textBook("reading.txt", 3, 80)]);
            await page.getByTitle("reading.txt", { exact: true }).click();
            await page.locator("#toggle-setting-panel:enabled").waitFor({ timeout: 2000 });
            await settleReader(page);

            for (const mode of ["cover", "slide"] as const) {
                await setMode(page, mode);
                await selectChapter(page, 2);
                await page.locator("#content").press("ArrowLeft");
                await page.waitForFunction(
                    () => document.querySelector("#chapter-title")?.textContent.includes("第1章"),
                    undefined,
                    { timeout: 2000 }
                );
                await settleReader(page);
                await page.locator("#content").press("ArrowRight");
                await page.waitForFunction(
                    () => document.querySelector("#chapter-title")?.textContent.includes("第2章"),
                    undefined,
                    { timeout: 2000 }
                );
                await settleReader(page);
            }

            await setMode(page, "none");
            await selectChapter(page, 2);
            await page.locator("#content").press("ArrowLeft");
            await page.waitForFunction(() => document.querySelector("#chapter-title")?.textContent.includes("第1章"));
            await waitForChapterLayout(page);
            const lastPage = (await page.locator("#page-position").getAttribute("aria-label"))?.match(/\d+/g);
            assert(lastPage?.length === 2);
            assert.equal(lastPage[0], lastPage[1]);
            await page.locator("#content").press("ArrowRight");
            await settleReader(page);
            assert.match((await page.locator("#chapter-title").textContent()) ?? "", /第2章/);
            assert.match((await page.locator("#page-position").getAttribute("aria-label")) ?? "", /第\s*1\s*页/);
            await page.locator("#content").press("ArrowRight");
            await settleReader(page);

            // 断言实际可见正文，不把内部页码或像素当作跨排版的内容位置。
            const visibleParagraphs = () =>
                page
                    .locator("#content > .reading-viewport:not(.reading-measure-viewport) p")
                    .evaluateAll((paragraphs) => {
                        const viewport = document
                            .querySelector("#content > .reading-viewport:not(.reading-measure-viewport)")
                            ?.getBoundingClientRect();
                        if (!viewport) throw new Error("Missing reading viewport");
                        return paragraphs
                            .filter((paragraph) =>
                                [...paragraph.getClientRects()].some(
                                    (rect) =>
                                        rect.bottom > viewport.top + 1 &&
                                        rect.top < viewport.bottom - 1 &&
                                        rect.right > viewport.left + 1 &&
                                        rect.left < viewport.right - 1
                                )
                            )
                            .map((paragraph) => paragraph.textContent);
                    });
            const anchor = (await visibleParagraphs())[0];
            assert(anchor);
            for (const mode of ["scroll", "cover", "slide", "none"] as const) {
                await setMode(page, mode);
                assert((await visibleParagraphs()).includes(anchor));
            }
            await page.locator("#toggle-setting-panel").click();
            await setReaderFontSize(page, 25);
            await page.locator("#setting .close").click();
            await waitForChapterLayout(page);
            assert((await visibleParagraphs()).includes(anchor));
            const saved = await page.locator("#page-position").getAttribute("aria-label");
            await page.reload();
            await page
                .locator("#content > .reading-viewport:not(.reading-measure-viewport) .reading-chapter")
                .waitFor();
            await waitForChapterLayout(page);
            assert.equal(await page.locator("#page-position").getAttribute("aria-label"), saved);
            assert((await visibleParagraphs()).includes(anchor));

            await selectChapter(page, 3);
            await setMode(page, "scroll");
            await page.locator("#content > .reading-viewport:not(.reading-measure-viewport)").evaluate((viewport) => {
                viewport.scrollTop = viewport.scrollHeight;
            });
            await page.waitForFunction(
                () => Number.parseFloat(document.querySelector("#progress-rate")?.textContent ?? "") === 100
            );
            assert.equal(Number.parseFloat((await page.locator("#progress-rate").textContent()) ?? ""), 100);
        });
    });
}
