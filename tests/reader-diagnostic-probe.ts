/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Page } from "playwright-core";
import type Progress from "../src/domain/progress/progress.ts";
import { createEpubFixture } from "./fixtures/epub-fixtures.ts";
import { captureReaderDiagnostics } from "./reader-diagnostics.ts";
import {
    importBooks,
    openBook,
    setMode,
    settleReader,
    startBrowserTests,
    stopBrowserTests,
    withPage,
} from "./browser-test-support.ts";

const directory = resolve("work/reader-font-probe");
const content =
    Array.from(
        { length: 6400 },
        (_, index) => `${String(index).padStart(4, "0")}这是用于验证长段落尾部锚点的正文。`
    ).join("") + "尾部目标";

/**
 * 只读真实保存的测试进度，不以应用的 DOM 元信息推算源偏移。
 */
async function readProgress(page: Page): Promise<Progress[]> {
    return page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("aura");
            request.onupgradeneeded = () => {
                request.transaction?.abort();
                reject(new Error("The probe requires its existing isolated library"));
            };
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Unable to open probe progress"));
            };
        });
        try {
            return await new Promise<Progress[]>((resolve, reject) => {
                const request = database
                    .transaction("progress", "readonly")
                    .objectStore("progress")
                    .getAll() as IDBRequest<Progress[]>;
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(request.error ?? new Error("Unable to read probe progress"));
                };
            });
        } finally {
            database.close();
        }
    });
}

/**
 * 验证空尾锚点前的文字确实位于视窗内，保持原场景的准备条件。
 */
async function waitForTail(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const viewport = document.querySelector("#content > .reading-viewport:not(.reading-measure-viewport)");
        if (!viewport) return false;
        const bounds = viewport.getBoundingClientRect();
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
    });
}

/**
 * 每步等待 300ms 是本探针隔离 160ms 保存防抖的条件，不改变长期测试的等待或断言。
 */
async function captureStep(page: Page, index: number, delta: number, relativeInput: number, inputAt: number) {
    await delay(300);
    await settleReader(page);
    const saved = await readProgress(page);
    assert.equal(saved.length, 1);
    const anchor = saved[0];
    assert(anchor);
    assert.equal(anchor.blockNumber, 2);
    const sourceText = content.slice(anchor.contentOffset, anchor.contentOffset + 64);
    assert.equal(sourceText.length, 64);
    assert.equal(content.indexOf(sourceText), anchor.contentOffset);
    const diagnostics = await captureReaderDiagnostics(page, sourceText, content);
    return { index, delta, relativeInput, inputAt, sampledAt: Date.now(), saved, sourceText, diagnostics };
}

/**
 * 首次失败保留完整现场和同一步稍后快照，后者仍检查首次保存位置的同一段原文。
 */
async function rejectFailure(page: Page, step: Awaited<ReturnType<typeof captureStep>>): Promise<void> {
    if (step.diagnostics.snapshot.includes.current) return;
    const error = new Error(`Full 64-character visibility failed at probe step ${String(step.index)}`);
    const failures: unknown[] = [error];
    try {
        await writeFile(resolve(directory, "step-failure.json"), JSON.stringify({ first: step }, null, 2));
        await page.screenshot({ path: resolve(directory, "step-failure.png"), fullPage: true });
        await delay(300);
        const savedLater = await readProgress(page);
        const later = await captureReaderDiagnostics(page, step.sourceText, content);
        await writeFile(
            resolve(directory, "step-failure.json"),
            JSON.stringify(
                { first: step, later: { saved: savedLater, sampledAt: Date.now(), diagnostics: later } },
                null,
                2
            )
        );
    } catch (diagnosticError) {
        failures.push(diagnosticError);
    }
    if (failures.length > 1) throw new AggregateError(failures, "Probe and evidence capture failed", { cause: error });
    throw error;
}

/**
 * 在隔离 Web 页面重建原锚点场景，只通过真实滚轮扫描相邻位置。
 */
async function runProbe(): Promise<void> {
    const failures: unknown[] = [];
    await mkdir(directory, { recursive: true });
    try {
        await startBrowserTests();
        await withPage("web", async (page) => {
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
            await setMode(page, "scroll");
            await page.locator('#content a[data-book-fragment="tail"]').click();
            await settleReader(page);
            await waitForTail(page);
            const original = await readProgress(page);
            assert.equal(original[0]?.blockNumber, 2);
            assert.equal(original[0].contentOffset, content.length);

            await page.reload();
            await page.locator("#toggle-setting-panel:not([disabled])").waitFor();
            await settleReader(page);
            await waitForTail(page);
            assert.deepEqual(await readProgress(page), original);

            const previousRate = await page.locator("#progress-rate").textContent();
            await page.locator("#content").hover();
            const inputAt = Date.now();
            await page.mouse.wheel(0, -180);
            await page.waitForFunction(
                (rate) => document.querySelector("#progress-rate")?.textContent !== rate,
                previousRate
            );
            const baseline = await captureStep(page, 0, -180, 0, inputAt);
            await writeFile(resolve(directory, "base.json"), JSON.stringify({ original, baseline }, null, 2));
            await writeFile(
                resolve(directory, "environment.json"),
                JSON.stringify(
                    {
                        node: process.version,
                        platform: process.platform,
                        userAgent: baseline.diagnostics.snapshot.userAgent,
                        devicePixelRatio: baseline.diagnostics.snapshot.devicePixelRatio,
                        fonts: baseline.diagnostics.platformFonts,
                        intervalMs: 300,
                        directionSteps: 80,
                        scope: "Controlled wheel geometry probe; does not replace the original CI failure scene",
                    },
                    null,
                    2
                )
            );
            await rejectFailure(page, baseline);

            // 正向最多 80px，再逐像素反向回到输入基准；输入量不冒充实际滚动距离。
            let index = 0;
            let relativeInput = 0;
            for (const delta of [1, -1]) {
                for (let count = 0; count < 80; count++) {
                    const inputAt = Date.now();
                    await page.mouse.wheel(0, delta);
                    relativeInput += delta;
                    const step = await captureStep(page, ++index, delta, relativeInput, inputAt);
                    await rejectFailure(page, step);
                }
            }
            const summary = {
                passed: true,
                baselineChecked: true,
                steps: index,
                relativeInput,
                completedAt: Date.now(),
            };
            await writeFile(resolve(directory, "summary.json"), JSON.stringify(summary, null, 2));
            console.log(JSON.stringify(summary));
        });
    } catch (error) {
        failures.push(error);
    }
    try {
        await stopBrowserTests();
    } catch (error) {
        failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Reader probe failed", { cause: failures[0] });
}

await runProbe();
