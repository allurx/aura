/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Page } from "playwright-core";
import type Progress from "../src/domain/progress/progress.ts";

/**
 * 仅在原断言已经失败后诊断隔离测试页面，不接入用户浏览器或改变阅读状态。
 * 数据库读取成功后同步采样画面；平台字体另记采样时间，不能视作同一帧的证据。
 * 诊断失败直接抛出，由调用方连同原断言组成 AggregateError，不能替代原失败。
 */
export async function captureReaderDiagnostics(page: Page, sourceText: string, sourceContent: string) {
    const selector = "#content > .reading-viewport:not(.reading-measure-viewport)";
    const snapshot = await page.evaluate(
        ({ selector, sourceText, sourceContent }) => {
            /**
             * 数据库成功回调内一次读取几何与文本，不跨 await 拼接不同画面的结果。
             */
            function capture(progress: Progress[]) {
                const startedAt = performance.timeOrigin + performance.now();
                const viewport = document.querySelector<HTMLElement>(selector);
                if (!viewport) throw new Error("Missing diagnostic reading viewport");
                const scrollTopBefore = viewport.scrollTop;
                const scrollLeftBefore = viewport.scrollLeft;

                /**
                 * DOMRect 转为可序列化数据，保留逐字实际矩形。
                 */
                function rectangle(rect: DOMRectReadOnly) {
                    return {
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        right: rect.right,
                        width: rect.width,
                        height: rect.height,
                    };
                }
                const bounds = rectangle(viewport.getBoundingClientRect());

                /**
                 * 旧采样四边内缩 1px；当前采样仅将纵向改为 0.01px，并排除零面积。
                 */
                function visibility(rectangles: ReturnType<typeof rectangle>[]) {
                    return {
                        old: rectangles.some(
                            (rect) =>
                                rect.bottom > bounds.top + 1 &&
                                rect.top < bounds.bottom - 1 &&
                                rect.right > bounds.left + 1 &&
                                rect.left < bounds.right - 1
                        ),
                        current: rectangles.some(
                            (rect) =>
                                rect.width > 0 &&
                                rect.height > 0 &&
                                rect.bottom > bounds.top + 0.01 &&
                                rect.top < bounds.bottom - 0.01 &&
                                rect.right > bounds.left + 1 &&
                                rect.left < bounds.right - 1
                        ),
                    };
                }

                const targetStart = sourceText.length > 0 ? sourceContent.indexOf(sourceText) : -1;
                const targetUnique = targetStart >= 0 && sourceContent.lastIndexOf(sourceText) === targetStart;
                const visibleText = { old: "", current: "" };
                const targetCharacters: {
                    sourceOffset: number;
                    character: string;
                    paragraphIndex: number;
                    nodeIndex: number;
                    nodeOffset: number;
                    rectangles: ReturnType<typeof rectangle>[];
                    visible: ReturnType<typeof visibility>;
                }[] = [];
                let firstVisibleOld: (typeof targetCharacters)[number] | undefined;
                let firstVisibleCurrent: (typeof targetCharacters)[number] | undefined;
                const range = document.createRange();
                const paragraphs = [...viewport.querySelectorAll("p")].map((paragraph, paragraphIndex) => {
                    const text = paragraph.textContent;
                    const sourceStart = text.length > 0 ? sourceContent.indexOf(text) : -1;
                    const unique = sourceStart >= 0 && sourceContent.lastIndexOf(text) === sourceStart;
                    const rectangles = [...paragraph.getClientRects()].map(rectangle);
                    const paragraphVisible = visibility(rectangles);
                    const style = getComputedStyle(paragraph);
                    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
                    let paragraphOffset = 0;
                    let nodeIndex = 0;

                    // 源起点来自夹具原文的唯一匹配，不相信应用生成的 offset 或 piece 元信息。
                    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                        const nodeText = node.textContent ?? "";
                        let nodeOffset = 0;
                        for (const character of nodeText) {
                            range.setStart(node, nodeOffset);
                            range.setEnd(node, nodeOffset + character.length);
                            const rectangles = [...range.getClientRects()].map(rectangle);
                            const rawVisible = visibility(rectangles);
                            const visible = {
                                old: paragraphVisible.old && rawVisible.old,
                                current: paragraphVisible.current && rawVisible.current,
                            };
                            if (visible.old) visibleText.old += character;
                            if (visible.current) visibleText.current += character;
                            if (unique) {
                                const sourceOffset = sourceStart + paragraphOffset + nodeOffset;
                                const sample = {
                                    sourceOffset,
                                    character,
                                    paragraphIndex,
                                    nodeIndex,
                                    nodeOffset,
                                    rectangles,
                                    visible,
                                };
                                if (visible.old) firstVisibleOld ??= sample;
                                if (visible.current) firstVisibleCurrent ??= sample;
                                if (
                                    targetUnique &&
                                    sourceOffset >= targetStart &&
                                    sourceOffset < targetStart + sourceText.length
                                )
                                    targetCharacters.push(sample);
                            }
                            nodeOffset += character.length;
                        }
                        paragraphOffset += nodeText.length;
                        nodeIndex++;
                    }
                    return {
                        paragraphIndex,
                        textLength: text.length,
                        textPrefix: text.slice(0, 80),
                        sourceStart: unique ? sourceStart : null,
                        sourceMatch: sourceStart < 0 ? "absent" : unique ? "unique" : "ambiguous",
                        rectangles,
                        font: {
                            family: style.fontFamily,
                            size: style.fontSize,
                            weight: style.fontWeight,
                            lineHeight: style.lineHeight,
                            letterSpacing: style.letterSpacing,
                        },
                    };
                });
                const targetFirstCharacter = targetCharacters.find((item) => item.sourceOffset === targetStart);
                return {
                    startedAt,
                    completedAt: performance.timeOrigin + performance.now(),
                    progress,
                    bounds,
                    scrollTopBefore,
                    scrollTopAfter: viewport.scrollTop,
                    scrollLeftBefore,
                    scrollLeftAfter: viewport.scrollLeft,
                    scrollHeight: viewport.scrollHeight,
                    scrollWidth: viewport.scrollWidth,
                    clientHeight: viewport.clientHeight,
                    clientWidth: viewport.clientWidth,
                    currentRate: document.querySelector("#progress-rate")?.textContent,
                    chapterTitle: document.querySelector("#chapter-title")?.textContent,
                    pagePosition: document.querySelector("#page-position")?.textContent,
                    layoutBusy: document.querySelector("#page-position")?.getAttribute("aria-busy"),
                    readingMode: document.querySelector("#content")?.getAttribute("data-reading-mode"),
                    userAgent: navigator.userAgent,
                    devicePixelRatio,
                    visibilityState: document.visibilityState,
                    modalOpen: document.querySelector("dialog:modal") !== null,
                    documentFontsStatus: document.fonts.status,
                    documentFonts: [...document.fonts].map((font) => ({
                        family: font.family,
                        status: font.status,
                        style: font.style,
                        weight: font.weight,
                    })),
                    paragraphs,
                    sourceText,
                    sourceContentLength: sourceContent.length,
                    targetStart,
                    targetUnique,
                    targetCharacters,
                    targetFirstCharacterTop: targetFirstCharacter?.rectangles.map((rect) => rect.top - bounds.top),
                    firstVisibleOld,
                    firstVisibleCurrent,
                    visibleText,
                    includes: {
                        old: visibleText.old.includes(sourceText),
                        current: visibleText.current.includes(sourceText),
                    },
                };
            }

            return new Promise<ReturnType<typeof capture>>((resolve, reject) => {
                const request = indexedDB.open("aura");
                request.onupgradeneeded = () => {
                    request.transaction?.abort();
                    reject(new Error("Reader diagnostics require the existing isolated test database"));
                };
                request.onerror = () => {
                    reject(request.error ?? new Error("Unable to open diagnostic progress database"));
                };
                request.onsuccess = () => {
                    const database = request.result;
                    try {
                        const transaction = database.transaction("progress", "readonly");
                        const progress = transaction.objectStore("progress").getAll() as IDBRequest<Progress[]>;
                        progress.onerror = () => {
                            database.close();
                            reject(progress.error ?? new Error("Unable to read diagnostic progress"));
                        };
                        transaction.onabort = () => {
                            database.close();
                            reject(transaction.error ?? new Error("Diagnostic progress transaction aborted"));
                        };
                        progress.onsuccess = () => {
                            try {
                                resolve(capture(progress.result));
                            } catch (error) {
                                reject(
                                    error instanceof Error
                                        ? error
                                        : new Error("Reader snapshot failed", { cause: error })
                                );
                            } finally {
                                database.close();
                            }
                        };
                    } catch (error) {
                        database.close();
                        reject(
                            error instanceof Error
                                ? error
                                : new Error("Diagnostic transaction failed", { cause: error })
                        );
                    }
                };
            });
        },
        { selector, sourceText, sourceContent }
    );

    // CDP 会经过后续任务；这些字体节点与版本信息明确不属于上面的同步快照。
    const platformFontsStartedAt = Date.now();
    const session = await page.context().newCDPSession(page);
    const paragraphFonts: {
        paragraphIndex: number;
        nodeId: number;
        fonts: { familyName: string; postScriptName: string; isCustomFont: boolean; glyphCount: number }[];
    }[] = [];
    let failure: Error | undefined;
    try {
        await session.send("DOM.enable");
        await session.send("CSS.enable");
        const { root } = await session.send("DOM.getDocument");
        const { nodeIds } = await session.send("DOM.querySelectorAll", {
            nodeId: root.nodeId,
            selector: `${selector} p`,
        });
        for (const [paragraphIndex, nodeId] of nodeIds.entries()) {
            const { fonts } = await session.send("CSS.getPlatformFontsForNode", { nodeId });
            paragraphFonts.push({ paragraphIndex, nodeId, fonts });
        }
    } catch (error) {
        failure = error instanceof Error ? error : new Error("Reader font capture failed", { cause: error });
    }
    try {
        await session.detach();
    } catch (error) {
        if (failure !== undefined)
            throw new AggregateError([failure, error], "Reader diagnostic font capture failed", { cause: error });
        throw error;
    }
    if (failure !== undefined) throw failure;
    return {
        snapshot,
        platformFonts: {
            startedAt: platformFontsStartedAt,
            completedAt: Date.now(),
            browserVersion: page.context().browser()?.version(),
            paragraphs: paragraphFonts,
        },
    };
}
