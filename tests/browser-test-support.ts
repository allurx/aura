/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { preview, type PreviewServer } from "vite";

export type Delivery = "web" | "portable";
export interface BookUpload {
    name: string;
    mimeType: string;
    buffer: Buffer;
}

const repository = fileURLToPath(new URL("../", import.meta.url));
let browser: Browser | undefined;
let server: PreviewServer | undefined;
let webUrl: string;

/**
 * 使用已经构建的两种交付；新建无用户资料的 Chrome，不下载浏览器或连接现有会话。
 */
export async function startBrowserTests(): Promise<void> {
    server = await preview({
        configFile: false,
        root: repository,
        build: { outDir: "dist/web" },
        preview: { host: "127.0.0.1", port: 0, open: false },
    });
    const address = server.httpServer.address();
    assert(address && typeof address !== "string");
    webUrl = `http://127.0.0.1:${String(address.port)}/`;
    browser = await chromium.launch({ channel: "chrome", headless: true });
}

/**
 * 先结束浏览器请求，再关闭仅属于本测试的预览服务。
 */
export async function stopBrowserTests(): Promise<void> {
    await browser?.close();
    const httpServer = server?.httpServer;
    if (httpServer) {
        await new Promise<void>((resolveClose, reject) => {
            httpServer.close((error) => {
                if (error) reject(error);
                else resolveClose();
            });
        });
    }
}

/**
 * 每个用例独立上下文与本地数据库；收集异常、控制台、资源失败与 DevTools Issues。
 */
export async function withPage(delivery: Delivery, operation: (page: Page) => Promise<void>): Promise<void> {
    assert(browser);
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
        acceptDownloads: true,
    });
    const errors: string[] = [];
    context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
    try {
        const page = await context.newPage();
        await page.addInitScript(() => {
            window.addEventListener("error", (event) => {
                // 原生渲染错误可能没有异常对象，浏览器的 pageerror 事件无法完整覆盖。
                if (event.error === null || event.error === undefined) console.error(event.message);
            });
        });
        page.on("console", (message) => {
            if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
        });
        page.on("requestfailed", (request) => {
            errors.push(`Request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`);
        });
        page.on("response", (response) => {
            if (response.status() >= 400) errors.push(`HTTP ${String(response.status())}: ${response.url()}`);
        });
        const diagnostics = await context.newCDPSession(page);
        diagnostics.on("Audits.issueAdded", ({ issue }) => {
            errors.push(`DevTools ${issue.code}: ${JSON.stringify(issue.details)}`);
        });
        await diagnostics.send("Audits.enable");
        page.setDefaultTimeout(10_000);
        const url = delivery === "web" ? webUrl : pathToFileURL(resolve(repository, "dist/portable/aura.html")).href;
        await page.goto(url);
        await page.locator(".shelf-empty-import").waitFor();
        await operation(page);
        assert.deepEqual(errors, []);
    } finally {
        await context.close();
    }
}

/**
 * 经实际文件输入导入，等待结果列表和忙碌状态结束。
 */
export async function importBooks(page: Page, files: BookUpload[]): Promise<void> {
    const expected = Number.parseInt(await page.locator("#book-count").innerText(), 10) + files.length;
    await page.locator("#book-input").setInputFiles(files);
    await waitForBookCount(page, expected);
}

/**
 * 等待当前筛选的总数和操作结束；窗口中挂载的书卡不代表全部结果。
 */
export async function waitForBookCount(page: Page, count: number): Promise<void> {
    await page.waitForFunction(
        (expected) => document.querySelector("#book-count")?.textContent === `${String(expected)} 本`,
        count
    );
    await page.locator(".overlay").waitFor({ state: "hidden" });
}

/**
 * 通过书封进入阅读，初始化成功后工具和正文都应可用。
 */
export async function openBook(page: Page, name: string): Promise<void> {
    await page.getByTitle(name, { exact: true }).click();
    await page.locator("#reader").waitFor();
    await page.locator("#reader-actions:not([hidden])").waitFor();
    await page.locator("#toggle-setting-panel:not([disabled])").waitFor();
    await page
        .locator("#content > .reading-viewport:not(.reading-measure-viewport) .reading-chapter")
        .first()
        .waitFor();
    await settleReader(page);
}

/**
 * 在原生设置控件选择方式，等待面板关闭和正文布局稳定。
 */
export async function setMode(page: Page, mode: "cover" | "slide" | "scroll" | "none"): Promise<void> {
    await page.locator("#toggle-setting-panel").click();
    await page.locator(`input[name="reading-mode"][value="${mode}"]`).check();
    await page.locator("#setting .close").click();
    await page.waitForFunction(
        (value) => document.querySelector("#content")?.getAttribute("data-reading-mode") === value,
        mode
    );
    await settleReader(page);
}

/**
 * 选章完成后面板才关闭，避免把已点击目录当作正文已到达。
 */
export async function selectChapter(page: Page, number: number): Promise<void> {
    await page.locator("#toggle-toc-panel").click();
    await page.locator(`#toc-chapters button[data-chapter-number="${String(number)}"]`).click();
    await page.locator("#toc[open]").waitFor({ state: "hidden" });
    await settleReader(page);
}

/**
 * 连续帧核对可见正文、位置及动画稳定；后台测量不阻止用户继续操作。
 */
export async function settleReader(page: Page): Promise<void> {
    await waitForReaderState(page, false);
}

/**
 * 精确索引与可见画面在同一次采样中确认，不能先接受旧章节的完成状态再等待新画面。
 */
async function waitForReaderState(page: Page, requireExactLayout: boolean): Promise<void> {
    const state = await page.evaluateHandle(() => ({ signature: "", stableFrames: 0 }));
    try {
        // waitForFunction 按帧轮询同步结果；async 谓词会以 Promise 为真值提前停止轮询。
        await page.waitForFunction(
            ({ sample, exactLayout }) => {
                const ready =
                    !document.documentElement.hasAttribute("data-page-turn") &&
                    (!exactLayout || document.querySelector("#page-position")?.getAttribute("aria-busy") === "false") &&
                    document.getAnimations().every((animation) => animation.playState !== "running");
                if (!ready) {
                    sample.stableFrames = 0;
                    return false;
                }
                const viewport = document.querySelector("#content > .reading-viewport:not(.reading-measure-viewport)");
                const signature = JSON.stringify([
                    viewport?.scrollLeft,
                    viewport?.scrollTop,
                    viewport?.scrollHeight,
                    viewport?.clientHeight,
                    viewport?.clientWidth,
                    document.querySelector("#chapter-title")?.textContent,
                    document.querySelector("#page-position")?.textContent,
                    viewport?.textContent,
                ]);
                sample.stableFrames = signature === sample.signature ? sample.stableFrames + 1 : 0;
                sample.signature = signature;
                return sample.stableFrames >= 6;
            },
            { sample: state, exactLayout: requireExactLayout }
        );
    } finally {
        await state.dispose();
    }
}

/**
 * 仅在断言精确章内页码或总页数时等待索引完成，不把它当作阅读可用的前置条件。
 */
export async function waitForChapterLayout(page: Page): Promise<void> {
    await waitForReaderState(page, true);
}

/**
 * 小型文本样本足以覆盖短章或普通多页章节，不依赖外部书籍。
 */
export function textBook(name: string, chapters = 3, lines = 1): BookUpload {
    const text = Array.from(
        { length: chapters },
        (_, chapter) =>
            `第${String(chapter + 1)}章 测试章节\n` +
            Array.from(
                { length: lines },
                (_, line) =>
                    `这是章节${String(chapter + 1)}的第${String(line + 1)}段，用于验证阅读位置和分页行为，正文不会被误识别为标题。`
            ).join("\n")
    ).join("\n\n");
    return { name, mimeType: "text/plain", buffer: Buffer.from(text) };
}
