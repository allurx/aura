/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { after, before, test } from "node:test";
import type { Page } from "playwright-core";
import { type default as Progress, formatReadingProgress } from "../src/domain/progress/progress.ts";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";
import {
    importBooks,
    openBook,
    setMode,
    setReaderFontSize,
    settleReader,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    waitForChapterLayout,
    withPage,
} from "./browser-test-support.ts";

before(startBrowserTests);
after(stopBrowserTests);

void test("reading percentage formatting stays compact without completing a nonfinal snapshot", () => {
    for (const [ratio, expected] of [
        [0, "0%"],
        [0.1, "10%"],
        [0.1234, "12.3%"],
        [0.1236, "12.4%"],
        [0.99999, "99.9%"],
        [1, "100%"],
    ] as const)
        assert.equal(formatReadingProgress(ratio), expected);
});

/**
 * 读取实际显示的正文，不能只用保存记录或页码证明画面恢复。
 * 前缀长度按 UTF-16 代码单元计算，只扫描断言需要的可见文字。
 */
async function readVisiblePage(
    page: Page,
    maxTextLength = Infinity
): Promise<{ text: string; firstTop: number | undefined }> {
    return page
        .locator("#content > .reading-viewport:not(.reading-measure-viewport) p")
        .evaluateAll((paragraphs, limit) => {
            const viewport = document
                .querySelector("#content > .reading-viewport:not(.reading-measure-viewport)")
                ?.getBoundingClientRect();
            if (!viewport) throw new Error("Missing reading viewport");

            // 纵向不足 1px 的可见首行仍可成为源锚点；横向保留相邻分页的接缝保护。
            const intersects = (rect: DOMRect): boolean =>
                rect.width > 0 &&
                rect.height > 0 &&
                rect.bottom > viewport.top + 0.01 &&
                rect.top < viewport.bottom - 0.01 &&
                rect.right > viewport.left + 1 &&
                rect.left < viewport.right - 1;
            const visible: string[] = [];
            let visibleLength = 0;
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
                            visibleLength += character.length;
                            if (visibleLength >= limit) return { text: visible.join("").slice(0, limit), firstTop };
                        }
                        offset += character.length;
                    }
                }
            }
            return { text: visible.join(""), firstTop };
        }, maxTextLength);
}

/**
 * 仅验证源正文时共用同一可见字符采样，不重复维护段落可见性的另一套定义。
 */
async function readVisibleText(page: Page, maxTextLength = Infinity): Promise<string> {
    return (await readVisiblePage(page, maxTextLength)).text;
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
    void test(`${delivery}: reading percentages follow the latest source position through completion and rewind`, async () => {
        await withPage(delivery, async (page) => {
            // 整本只有一章、一段，比例必须随段内源偏移变化，不能按章节数或块数估算。
            const source = Array.from(
                { length: 180 },
                (_, index) => `段内位置${String(index)}，同一段落中的阅读位置应随翻页前进，也应在回退时降低。`
            ).join("");
            const name = "single-paragraph-progress.txt";
            await importBooks(page, [{ name, mimeType: "text/plain", buffer: Buffer.from(source) }]);
            assert.equal(await page.locator(".book-progress").textContent(), "0%");
            assert.equal((await readProgress(page))[0]?.readingRatio, 0);
            await openBook(page, name);
            await setMode(page, "none");
            await waitForChapterLayout(page);
            const pageCount = Number(await page.locator("#page-position .total-pages").textContent());
            assert(pageCount > 2);

            await page.locator("#content").press("ArrowRight");
            await settleReader(page);
            const position = (await readProgress(page))[0];
            assert(position);
            assert.equal(position.chapterNumber, 1);
            assert.equal(position.blockNumber, 1);
            assert(position.contentOffset > 0);
            assert.equal(position.readingRatio, position.contentOffset / source.length);
            assert(position.readingRatio > 0 && position.readingRatio < 1);
            const percentage = await page.locator("#progress-rate").textContent();
            assert.match(percentage ?? "", /^\d+(?:\.\d)?%$/u);
            const visibleText = await readVisibleText(page, 64);

            // 退出与刷新只呈现同一次保存的比例；恢复正文时不靠书卡百分比重新定位。
            await page.locator("#return-bookshelf").click();
            await page.locator(".book-progress").waitFor();
            assert.equal(await page.locator(".book-progress").textContent(), percentage);
            assert.deepEqual(await readProgress(page), [position]);
            await page.reload();
            await page.locator(".book-progress").waitFor();
            assert.equal(await page.locator(".book-progress").textContent(), percentage);
            assert.deepEqual(await readProgress(page), [position]);
            await openBook(page, name);
            await waitForChapterLayout(page);
            assert.equal(await readVisibleText(page, 64), visibleText);
            assert.equal(await page.locator("#progress-rate").textContent(), percentage);

            // 只有真实末屏显示完成；返回上一屏后保存当前比例，不能保留最高已读百分比。
            for (let index = 2; index < pageCount; index++) {
                await page.locator("#content").press("ArrowRight");
                await settleReader(page);
            }
            assert.equal(await page.locator("#progress-rate").textContent(), "100%");
            assert.equal((await readProgress(page))[0]?.readingRatio, 1);
            await page.locator("#return-bookshelf").click();
            await page.locator(".book-progress").waitFor();
            assert.equal(await page.locator(".book-progress").textContent(), "100%");
            await openBook(page, name);
            await page.locator("#content").press("ArrowLeft");
            await settleReader(page);
            const rewound = (await readProgress(page))[0];
            assert(rewound?.readingRatio !== undefined && rewound.readingRatio > 0 && rewound.readingRatio < 1);
            const rewoundPercentage = await page.locator("#progress-rate").textContent();
            assert.notEqual(rewoundPercentage, "100%");
            await page.locator("#return-bookshelf").click();
            await page.locator(".book-progress").waitFor();
            assert.equal(await page.locator(".book-progress").textContent(), rewoundPercentage);
            assert.deepEqual(await readProgress(page), [rewound]);
        });
    });

    void test(`${delivery}: missing percentages stay hidden until normal reading saves an atomic snapshot`, async () => {
        await withPage(
            delivery,
            async (page) => {
                const name = "missing-percentage.txt";
                await importBooks(page, [textBook(name, 3, 32)]);
                await openBook(page, name);
                await setMode(page, "none");
                await page.locator("#content").press("ArrowRight");
                await settleReader(page);
                const sourceText = await readVisibleText(page, 64);
                await page.locator("#return-bookshelf").click();
                await page.locator(".book-progress").waitFor();
                const savedPercentage = await page.locator(".book-progress").textContent();
                assert.match(savedPercentage ?? "", /^\d+(?:\.\d)?%$/u);
                const saved = (await readProgress(page))[0];
                assert(saved);
                const legacy = { ...saved };
                delete legacy.readingRatio;

                // 只从真实阅读生成的测试记录移除新增展示字段，保留原有源位置作为旧记录样本。
                await page.evaluate(async (position) => {
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
                        await new Promise<void>((resolve, reject) => {
                            const transaction = database.transaction("progress", "readwrite");
                            transaction.objectStore("progress").put(position);
                            transaction.oncomplete = () => {
                                resolve();
                            };
                            transaction.onerror = () => {
                                reject(
                                    transaction.error ?? new Error("Unable to prepare the existing progress record")
                                );
                            };
                        });
                    } finally {
                        database.close();
                    }
                }, legacy);
                await page.reload();
                await page.locator(".book-progress").waitFor();
                assert.equal(await page.locator(".book-progress").textContent(), "");
                assert.equal(await page.locator(".book-progress").getAttribute("title"), null);
                assert.equal(await page.locator(".book-open").getAttribute("aria-label"), "阅读《missing-percentage》");
                assert.deepEqual(await readProgress(page), [legacy]);
                await openBook(page, name);
                assert.equal(await readVisibleText(page, 64), sourceText);
                assert.equal(await page.locator("#progress-rate").textContent(), savedPercentage);
                const reopened = (await readProgress(page))[0];
                assert(reopened);
                assert.deepEqual({ ...reopened, readingRatio: undefined }, { ...legacy, readingRatio: undefined });

                // 无需先翻页：正常打开再退出就保存展示比例，仍保留原来的源位置。
                await page.locator("#return-bookshelf").click();
                await page.locator(".book-progress").waitFor();
                assert.equal(await page.locator(".book-progress").textContent(), savedPercentage);
                const filled = (await readProgress(page))[0];
                assert(filled?.readingRatio !== undefined && filled.readingRatio > 0 && filled.readingRatio < 1);
                assert.deepEqual({ ...filled, readingRatio: undefined }, { ...legacy, readingRatio: undefined });
                await openBook(page, name);

                // 让下一次完整快照写入失败，源位置与比例必须一同保留，不能只提交其中一个。
                await page.evaluate(() => {
                    // eslint-disable-next-line @typescript-eslint/unbound-method -- 保存后还原原方法，调用时使用实际 store。
                    const original = IDBObjectStore.prototype.put;
                    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
                        if (this.name === "progress") {
                            IDBObjectStore.prototype.put = original;
                            throw new DOMException("Injected progress write failure", "QuotaExceededError");
                        }
                        return original.call(this, value, key);
                    };
                });
                await page.locator("#content").press("ArrowRight");
                const failure = page.getByRole("dialog", { name: "阅读位置尚未保存", exact: true });
                await failure.waitFor();
                assert.deepEqual(await readProgress(page), [filled]);
                await failure.getByRole("button", { name: "知道了", exact: true }).click();
                const recoveredPercentage = await page.locator("#progress-rate").textContent();
                await page.locator("#return-bookshelf").click();
                await page.locator(".book-progress").waitFor();
                assert.equal(await page.locator(".book-progress").textContent(), recoveredPercentage);
                const recovered = (await readProgress(page))[0];
                assert(recovered?.readingRatio !== undefined && recovered.readingRatio > filled.readingRatio);
                assert.notDeepEqual(recovered, filled);
                await page.reload();
                await page.locator(".book-progress").waitFor();
                assert.equal(await page.locator(".book-progress").textContent(), recoveredPercentage);
                assert.deepEqual(await readProgress(page), [recovered]);
            },
            ["阅读位置尚未保存"]
        );
    });

    void test(`${delivery}: delayed page preparation and release preserve paper geometry`, async () => {
        for (const mode of ["cover", "slide"] as const) {
            for (const releaseWhilePending of [false, true]) {
                await withPage(delivery, async (page) => {
                    await page.emulateMedia({ reducedMotion: "no-preference" });
                    await importBooks(page, [textBook("paper-geometry.txt", 3, 1)]);
                    await openBook(page, "paper-geometry.txt");
                    await setMode(page, mode);
                    await page.setViewportSize({ width: 390, height: 844 });
                    await settleReader(page);
                    const originalProgress = await readProgress(page);
                    const originalText = await readVisibleText(page);
                    const bounds = await page.locator("#content").boundingBox();
                    assert(bounds);
                    const start = { x: bounds.x + bounds.width * 0.6, y: bounds.y + bounds.height / 2, id: 1 };
                    const touch = await page.context().newCDPSession(page);
                    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
                    const begin = async (offset: number): Promise<void> => {
                        await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
                        await touch.send("Input.dispatchTouchEvent", {
                            type: "touchMove",
                            touchPoints: [{ ...start, x: start.x + offset }],
                        });
                        await page.locator(".reading-papers").waitFor();
                    };

                    // 真正书头仍应有阻力；不能以禁止所有位移来满足准备期间的稳定性。
                    await begin(45);
                    await page.waitForFunction(() => {
                        const paper = document.querySelector(".reading-paper");
                        return paper && new DOMMatrixReadOnly(getComputedStyle(paper).transform).m41 > 0;
                    });
                    const boundary = await page
                        .locator(".reading-paper")
                        .first()
                        .evaluate((paper) => new DOMMatrixReadOnly(getComputedStyle(paper).transform).m41);
                    assert(boundary > 0 && boundary < 45);
                    await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
                    await page.locator(".reading-papers").waitFor({ state: "detached" });
                    assert.deepEqual(await readProgress(page), originalProgress);

                    // 真实事务占用章节 store，确定性地延迟跨章读取；不替换产品方法或写入书籍。
                    await page.evaluate(async () => {
                        const database = await new Promise<IDBDatabase>((resolve, reject) => {
                            const request = indexedDB.open("aura");
                            request.onsuccess = () => {
                                resolve(request.result);
                            };
                            request.onerror = () => {
                                reject(request.error ?? new Error("Unable to hold chapters"));
                            };
                        });
                        const transaction = database.transaction("chapter", "readwrite");
                        const store = transaction.objectStore("chapter");
                        let holding = true;
                        document.addEventListener(
                            "release-geometry-chapters",
                            () => {
                                holding = false;
                            },
                            { once: true }
                        );
                        transaction.oncomplete = () => {
                            database.close();
                        };
                        const retain = (): void => {
                            if (holding) store.get(["geometry-lock", 0]).onsuccess = retain;
                        };
                        retain();
                    });
                    await begin(-bounds.width * 0.4);
                    const pending = await page.locator(".reading-papers").evaluate(async (papers) => {
                        const samples: number[] = [];
                        for (let index = 0; index < 4; index++) {
                            await new Promise<void>((resolve) =>
                                requestAnimationFrame(() => {
                                    resolve();
                                })
                            );
                            const current = papers.firstElementChild;
                            if (!current) throw new Error("Missing current paper");
                            samples.push(new DOMMatrixReadOnly(getComputedStyle(current).transform).m41);
                        }
                        return {
                            samples,
                            currentLeft: papers.firstElementChild?.getBoundingClientRect().left,
                            frameRight: papers.getBoundingClientRect().right,
                            visible: [...papers.children].filter(
                                (paper) => getComputedStyle(paper).visibility === "visible"
                            ).length,
                        };
                    });
                    assert.equal(pending.visible, 1, "next chapter must still be held");
                    assert(
                        pending.samples.every((x) => Math.abs(x) <= 1),
                        `${mode}: pending paper moved: ${JSON.stringify(pending.samples)}`
                    );

                    let beforeRelease: number[];
                    if (releaseWhilePending) {
                        assert(pending.currentLeft !== undefined);
                        beforeRelease = [pending.currentLeft];
                        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
                        await page.evaluate(() => document.dispatchEvent(new Event("release-geometry-chapters")));
                    } else {
                        await page.evaluate(() => document.dispatchEvent(new Event("release-geometry-chapters")));
                        await page.waitForFunction(
                            () =>
                                [...document.querySelectorAll(".reading-paper")].filter(
                                    (paper) => getComputedStyle(paper).visibility === "visible"
                                ).length === 2
                        );
                        // 反拉接近起点再松手，检查实际取消动画从最后呈现位置续接。
                        const moved = await page.evaluateHandle(() => ({
                            painted: new Promise<void>((resolve) => {
                                document.addEventListener(
                                    "pointermove",
                                    () => {
                                        requestAnimationFrame(() => {
                                            resolve();
                                        });
                                    },
                                    { once: true }
                                );
                            }),
                        }));
                        await touch.send("Input.dispatchTouchEvent", {
                            type: "touchMove",
                            touchPoints: [{ ...start, x: start.x - 4 }],
                        });
                        await page.evaluate(({ painted }) => painted, moved);
                        await moved.dispose();
                        beforeRelease = await page
                            .locator(".reading-paper")
                            .evaluateAll((papers) =>
                                papers
                                    .filter((paper) => getComputedStyle(paper).visibility === "visible")
                                    .map((paper) => paper.getBoundingClientRect().left)
                            );
                        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
                    }

                    // 暂停真实 Web Animation 并回到起始帧，避免墙钟调度把接续跳变掩盖掉。
                    await page.waitForFunction(() => {
                        const animations = document
                            .getAnimations()
                            .filter(
                                (animation) =>
                                    animation.effect instanceof KeyframeEffect &&
                                    animation.effect.target instanceof HTMLElement &&
                                    animation.effect.target.classList.contains("reading-paper")
                            );
                        if (animations.length === 0) return false;
                        for (const animation of animations) {
                            animation.pause();
                            animation.currentTime = 0;
                        }
                        return true;
                    });
                    const firstFrame = await page
                        .locator(".reading-paper")
                        .evaluateAll((papers) =>
                            papers
                                .filter((paper) => getComputedStyle(paper).visibility === "visible")
                                .map((paper) => paper.getBoundingClientRect().left)
                        );
                    for (const [index, left] of beforeRelease.entries())
                        assert(
                            Math.abs((firstFrame[index] ?? Infinity) - left) <= 1,
                            `${mode}: release jumped: ${JSON.stringify({ beforeRelease, firstFrame })}`
                        );
                    if (releaseWhilePending)
                        assert(
                            (firstFrame[1] ?? -Infinity) >= pending.frameRight - 1,
                            "late target must enter from outside the reading frame"
                        );
                    await page.evaluate(() => {
                        document.getAnimations().forEach((animation) => {
                            animation.finish();
                        });
                    });
                    await page.locator(".reading-papers").waitFor({ state: "detached" });
                    await settleReader(page);
                    if (releaseWhilePending) {
                        assert((await readVisibleText(page)).includes("这是章节2的第1段"));
                        assert.equal((await readProgress(page))[0]?.chapterNumber, 2);
                    } else {
                        assert.equal(await readVisibleText(page), originalText);
                        assert.deepEqual(await readProgress(page), originalProgress);
                    }
                    await touch.detach();
                });
            }
        }
    });

    void test(`${delivery}: interrupted page turns retain the latest chapter and saved source position`, async () => {
        for (const mode of ["cover", "slide"] as const) {
            await withPage(delivery, async (page) => {
                await page.emulateMedia({ reducedMotion: "no-preference" });
                await importBooks(page, [textBook("animated-progress.txt", 3, 1)]);
                await openBook(page, "animated-progress.txt");
                await setMode(page, mode);

                // 暂停真实纸面动画，确保下一次输入发生在内容已提交但动画尚未结束时。
                // 每章只有一页，连续前进和立即反向都会跨章，不依赖动画时长或内部导航 API。
                for (const [key, chapter] of [
                    ["ArrowRight", 2],
                    ["ArrowRight", 3],
                    ["ArrowLeft", 2],
                ] as const) {
                    await page.locator("#content").press(key);
                    await page.waitForFunction(() => {
                        const animations = document.getAnimations().filter((animation) => {
                            const effect = animation.effect;
                            return (
                                effect instanceof KeyframeEffect &&
                                effect.target instanceof HTMLElement &&
                                effect.target.classList.contains("reading-paper") &&
                                animation.playState === "running"
                            );
                        });
                        if (animations.length === 0) return false;
                        for (const animation of animations) animation.pause();
                        return true;
                    });
                    assert((await readVisibleText(page)).includes(`这是章节${String(chapter)}的第1段`));
                }

                const progress = await readProgress(page);
                assert.equal(progress[0]?.chapterNumber, 2);
                const visibleText = await readVisibleText(page);

                // 在最后一次动画尚未结束时离开，再打开必须恢复最终源位置，不能退回中间章节。
                await page.goBack();
                await page.locator("#bookshelf").waitFor();
                await openBook(page, "animated-progress.txt");
                assert.deepEqual(await readProgress(page), progress);
                assert.equal(await readVisibleText(page), visibleText);
            });
        }
    });

    void test(`${delivery}: default panels preserve the reading page in wide and compact windows`, async () => {
        await withPage(delivery, async (page) => {
            await page.setViewportSize({ width: 1600, height: 900 });
            await importBooks(page, [textBook("panel-reading-position.txt", 3, 120)]);
            await openBook(page, "panel-reading-position.txt");
            await page.locator("#content").press("ArrowRight");
            await waitForChapterLayout(page);
            const original = await readVisiblePage(page);
            const progress = await readProgress(page);
            const viewport = page.locator("#content > .reading-viewport:not(.reading-measure-viewport)");
            const originalBounds = await viewport.boundingBox();
            assert(originalBounds);

            for (const width of [1600, 1100, 1600]) {
                await page.setViewportSize({ width, height: 900 });
                await settleReader(page);
                const restingBounds = await viewport.boundingBox();
                assert(restingBounds);
                for (const panel of ["setting", "toc"]) {
                    await page.locator(`#toggle-${panel}-panel`).click();
                    await settleReader(page);
                    const bounds = await viewport.boundingBox();
                    assert(bounds);
                    assert.equal(bounds.width, originalBounds.width);
                    assert.equal(bounds.height, originalBounds.height);
                    assert.equal(bounds.x, restingBounds.x);
                    assert.equal(bounds.y, restingBounds.y);
                    assert.deepEqual(await readVisiblePage(page), original);
                    assert.deepEqual(await readProgress(page), progress);
                    await page.locator(`#${panel} .close`).click();
                    await settleReader(page);
                    assert.deepEqual(await viewport.boundingBox(), restingBounds);
                    assert.deepEqual(await readVisiblePage(page), original);
                    assert.deepEqual(await readProgress(page), progress);
                }
            }
        });
    });

    void test(`${delivery}: TOC keyboard occlusion preserves reading geometry and source position`, async () => {
        for (const mode of ["none", "scroll"] as const) {
            await withPage(delivery, async (page) => {
                await importBooks(page, [textBook("keyboard-reading-position.txt", 3, 120)]);
                await openBook(page, "keyboard-reading-position.txt");
                await setMode(page, mode);
                await page.setViewportSize({ width: 390, height: 844 });
                await settleReader(page);
                await page.locator("#content").press("PageDown");
                await settleReader(page);

                const paper = page.locator("#reader");
                const content = page.locator("#content");
                const viewport = page.locator("#content > .reading-viewport:not(.reading-measure-viewport)");
                const readBounds = () =>
                    Promise.all([paper.boundingBox(), content.boundingBox(), viewport.boundingBox()]);
                const originalBounds = await readBounds();
                assert(originalBounds.every(Boolean));
                const original = await readVisiblePage(page, 64);
                assert.equal(original.text.length, 64);
                const progress = await readProgress(page);
                const assertReadingUnchanged = async (): Promise<void> => {
                    assert.deepEqual(await readBounds(), originalBounds);
                    assert.deepEqual(await readVisiblePage(page, 64), original);
                    assert.deepEqual(await readProgress(page), progress);
                };

                if (!(await page.getByRole("button", { name: "打开目录", exact: true }).isVisible()))
                    await page.getByRole("button", { name: "显示阅读工具", exact: true }).press("Enter");
                await page.getByRole("button", { name: "打开目录", exact: true }).click();
                await page.getByRole("searchbox", { name: "查找章节", exact: true }).fill("测试章节");

                // 仅缩小键盘遮挡后的可视高度，保留实际布局视口；窗口 resize 无法覆盖此契约。
                for (const height of [470, 390]) {
                    await page.evaluate((visibleHeight) => {
                        const visualViewport = window.visualViewport;
                        if (!visualViewport) throw new Error("Visual viewport unavailable");
                        Object.defineProperty(visualViewport, "height", { configurable: true, value: visibleHeight });
                        visualViewport.dispatchEvent(new Event("resize"));
                    }, height);
                    await page.waitForFunction((visibleHeight) => {
                        const bounds = document.querySelector("#toc[open]")?.getBoundingClientRect();
                        return bounds !== undefined && bounds.height > 0 && bounds.bottom <= visibleHeight + 1;
                    }, height);
                    await settleReader(page);
                    await assertReadingUnchanged();
                }

                // 恢复浏览器原有高度，再经实际关闭入口检查画面和持久进度。
                await page.evaluate(() => {
                    const visualViewport = window.visualViewport;
                    if (!visualViewport) throw new Error("Visual viewport unavailable");
                    Reflect.deleteProperty(visualViewport, "height");
                    visualViewport.dispatchEvent(new Event("resize"));
                });
                await settleReader(page);
                await assertReadingUnchanged();
                await page.getByRole("button", { name: "关闭目录", exact: true }).click();
                await page.locator("#toc").waitFor({ state: "hidden" });
                await settleReader(page);
                await assertReadingUnchanged();
            });
        }
    });

    void test(`${delivery}: touch preview cancels without changing source progress and commits on release`, async () => {
        await withPage(delivery, async (page) => {
            await page.emulateMedia({ reducedMotion: "no-preference" });
            await importBooks(page, [textBook("touch-progress.txt", 3, 1)]);
            await openBook(page, "touch-progress.txt");
            await page.setViewportSize({ width: 390, height: 844 });
            await settleReader(page);
            const original = await readProgress(page);
            const originalText = await readVisibleText(page);
            const bounds = await page.locator("#content").boundingBox();
            assert(bounds);
            const touch = await page.context().newCDPSession(page);
            await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
            const y = bounds.y + bounds.height / 2;
            const start = bounds.x + bounds.width * 0.8;
            const end = bounds.x + bounds.width * 0.2;
            const begin = async (): Promise<void> => {
                await touch.send("Input.dispatchTouchEvent", {
                    type: "touchStart",
                    touchPoints: [{ x: start, y, id: 1 }],
                });
                await touch.send("Input.dispatchTouchEvent", {
                    type: "touchMove",
                    touchPoints: [{ x: end, y, id: 1 }],
                });
                await page.locator(".reading-papers").waitFor();
            };

            await begin();
            assert.deepEqual(await readProgress(page), original);
            assert.equal(await readVisibleText(page), originalText);
            await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
            await page.locator(".reading-papers").waitFor({ state: "detached" });
            assert.deepEqual(await readProgress(page), original);
            assert.equal(await readVisibleText(page), originalText);

            await begin();
            assert.deepEqual(await readProgress(page), original);
            await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
            await page.waitForFunction(() => document.querySelector("#chapter-title")?.textContent.includes("第2章"));
            assert.equal((await readProgress(page))[0]?.chapterNumber, 2);
            assert((await readVisibleText(page)).includes("这是章节2的第1段"));
            await touch.detach();
        });
    });

    void test(`${delivery}: EPUB links to empty tail anchors retain their source location after reopening`, async () => {
        for (const mode of ["none", "scroll"] as const) {
            await withPage(delivery, async (page) => {
                // 唯一序号区分源位置，长段落覆盖恢复窗口与后台索引的换行差异。
                const content =
                    Array.from(
                        { length: 6400 },
                        (_, index) => `${String(index).padStart(4, "0")}这是用于验证长段落尾部锚点的正文。`
                    ).join("") + "尾部目标";
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
                    await settleReader(page);
                    const scrolled = await readProgress(page);
                    assert.notDeepEqual(scrolled, progress);
                    assert.equal(scrolled[0]?.blockNumber, 2);
                    // 后台重排可能让锚点之前的字符进入同一行；恢复契约对应保存的源锚点。
                    const scrolledText = content.slice(scrolled[0].contentOffset, scrolled[0].contentOffset + 64);
                    assert.equal(scrolledText.length, 64);
                    assert.equal(content.indexOf(scrolledText), scrolled[0].contentOffset);
                    assert((await readVisibleText(page)).includes(scrolledText));

                    await page.reload();
                    await page.locator("#toggle-setting-panel:not([disabled])").waitFor();
                    await settleReader(page);
                    assert.deepEqual(await readProgress(page), scrolled);
                    // 刷新按源位置重新对齐，不要求保留滚轮留下的临时像素偏移。
                    assert((await readVisibleText(page)).includes(scrolledText));

                    // 先验收初始画面，再确认后台索引补全后同一源锚点仍然可见。
                    await waitForChapterLayout(page);
                    assert.deepEqual(await readProgress(page), scrolled);
                    assert((await readVisibleText(page)).includes(scrolledText));
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
                    const firstVisibleCell = () =>
                        page.locator("#content table td").evaluateAll((cells) => {
                            for (const cell of cells) {
                                const viewport = cell.closest(".reading-viewport")?.getBoundingClientRect();
                                const table = cell.closest("table")?.getBoundingClientRect();
                                if (!viewport || !table) continue;
                                const rect = cell.getBoundingClientRect();
                                const left = Math.max(rect.left, viewport.left, table.left);
                                const right = Math.min(rect.right, viewport.right, table.right);
                                const top = Math.max(rect.top, viewport.top, table.top);
                                const bottom = Math.min(rect.bottom, viewport.bottom, table.bottom);
                                if (
                                    right > left + 1 &&
                                    bottom > top + 1 &&
                                    cell.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))
                                )
                                    return cell.textContent;
                            }
                            return undefined;
                        });
                    const originalCell = await firstVisibleCell();
                    assert(originalCell);
                    await page.locator("#content table").hover();
                    const scrollTop = await page.locator("#content table").evaluate((table) => table.scrollTop);
                    await page.mouse.wheel(0, -240);
                    await page.waitForFunction(
                        (previous) => (document.querySelector("#content table")?.scrollTop ?? previous) < previous,
                        scrollTop
                    );
                    await settleReader(page);
                    const scrolledCell = await firstVisibleCell();
                    assert(scrolledCell);
                    assert.notEqual(scrolledCell, originalCell);
                    await page.locator("#return-bookshelf").click();
                    await page.locator("#bookshelf").waitFor();
                    const scrolled = await readProgress(page);
                    assert.notDeepEqual(scrolled, progress);
                    await openBook(page, "table-position.epub");
                    assert.deepEqual(await readProgress(page), scrolled);
                    assert.equal(await firstVisibleCell(), scrolledCell);
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
                const blocks = [...viewport.querySelectorAll<HTMLElement>("[data-block-number]")];
                const first = blocks[1];
                const last = blocks.at(-1);
                if (!first || !last) throw new Error("Missing rendered source blocks");
                const distance = Number(last.dataset["blockNumber"]) - Number(first.dataset["blockNumber"]);
                // 未测全章的占位高度会随字体变化；以实际段落间距进入深处，并留出继续翻页的空间。
                viewport.scrollTop =
                    ((last.getBoundingClientRect().top - first.getBoundingClientRect().top) / distance) * 3000;
            });
            await page.waitForFunction(
                () => Number.parseFloat(document.querySelector("#progress-rate")?.textContent ?? "0") > 30
            );
            const progress = await readProgress(page);
            const anchor = progress[0];
            assert(anchor && anchor.blockNumber > 2000 && anchor.blockNumber < 4000);

            // 连续有效输入和模式切换保留同一源位置，不要求后台全章排版先完成。
            await page.locator("#toggle-setting-panel").click();
            for (const fontSize of [22, 25, 18, 23]) {
                await setReaderFontSize(page, fontSize);
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

            // 章末补窗可能被最大滚动值夹取，视窗上缘的留白不得使字号重排丢掉真实源锚点。
            await setMode(page, "scroll");
            await page.locator("#toggle-setting-panel").click();
            await setReaderFontSize(page, 16);
            await page.locator("#setting .close").click();
            await page.locator("#content > .reading-viewport:not(.reading-measure-viewport)").evaluate((viewport) => {
                viewport.scrollTop = viewport.scrollHeight;
            });
            await page.waitForFunction(
                () => Number.parseFloat(document.querySelector("#progress-rate")?.textContent ?? "0") > 99
            );
            const tail = await readProgress(page);
            assert(tail[0] && tail[0].blockNumber > 5900);
            const tailText = (await readVisiblePage(page, 64)).text;
            assert(tailText);
            // 字号变化可能让同一源锚点不再覆盖书尾；定位保持不变，展示比例跟随当前快照。
            const assertTailSnapshot = async (): Promise<void> => {
                const current = await readProgress(page);
                assert.deepEqual(
                    current.map((position) => ({ ...position, readingRatio: undefined })),
                    tail.map((position) => ({ ...position, readingRatio: undefined }))
                );
                const ratio = current[0]?.readingRatio;
                assert(ratio !== undefined);
                assert.equal(await page.locator("#progress-rate").textContent(), formatReadingProgress(ratio));
            };
            await page.locator("#toggle-setting-panel").click();
            for (const fontSize of [22, 25, 18, 23]) {
                await setReaderFontSize(page, fontSize);
                await settleReader(page);
                await assertTailSnapshot();
                assert((await readVisibleText(page)).includes(tailText));
            }
            await page.locator("#setting .close").click();
            await settleReader(page);
            await assertTailSnapshot();
            assert((await readVisibleText(page)).includes(tailText));
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

                    // 三种模式共用分页布局；无动画模式覆盖完整断点矩阵及累计漂移，其余模式保留窄屏往返。
                    const widths =
                        mode === "none"
                            ? [1000, 801, 800, 601, 600, 390, 600, 601, 800, 801, 1000, 1440]
                            : [800, 600, 390, 600, 800, 1440];
                    const rounds = mode === "none" ? 2 : 1;
                    for (let round = 0; round < rounds; round++) {
                        for (const width of widths) {
                            await page.setViewportSize({ width, height: 900 });
                            await settleReader(page);
                            assert.deepEqual(await readProgress(page), progress, `${mode}, width ${String(width)}`);
                            const reflowed = await readVisiblePage(page, 24);
                            assert.equal(reflowed.text, visibleText.slice(0, 24));
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
                    const reloaded = await readVisiblePage(page);
                    assert.equal(reloaded.text, visibleText);
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
