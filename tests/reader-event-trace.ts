/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Page } from "playwright-core";

/**
 * 为后续加载的隔离测试页面安装有界阅读时间线，不连接用户浏览器。
 * 仅记录输入、少量滚动几何、正文挂载和原生保存事件，不等待或改变事件处理结果。
 */
export async function installReaderEventTrace(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const key = Symbol.for("aura.reader.diagnosticTrace");
        if (Object.prototype.hasOwnProperty.call(window, key)) return;
        const trace = {
            startedAt: performance.timeOrigin + performance.now(),
            capacity: 200,
            dropped: 0,
            events: [] as { time: number; type: string; details: unknown }[],
        };
        Object.defineProperty(window, key, { value: trace });
        const selector = "#content > .reading-viewport:not(.reading-measure-viewport)";

        /**
         * 最多保留最近 200 条，计数明确表示较早事件已被截断。
         */
        function record(type: string, details: unknown): void {
            trace.events.push({ time: performance.timeOrigin + performance.now(), type, details });
            if (trace.events.length > trace.capacity) {
                trace.events.shift();
                trace.dropped++;
            }
        }

        /**
         * 只读取滚动容器，不逐字测量正文或枚举布局中的全部节点。
         */
        function geometry(viewport: HTMLElement) {
            return {
                scrollTop: viewport.scrollTop,
                scrollLeft: viewport.scrollLeft,
                scrollHeight: viewport.scrollHeight,
                clientHeight: viewport.clientHeight,
            };
        }

        document.addEventListener(
            "wheel",
            (event) => {
                const viewport = document.querySelector<HTMLElement>(selector);
                if (!viewport || !(event.target instanceof Element) || !event.target.closest("#content")) return;
                record("wheel", {
                    ...geometry(viewport),
                    deltaX: event.deltaX,
                    deltaY: event.deltaY,
                    deltaMode: event.deltaMode,
                });
            },
            { capture: true, passive: true }
        );
        document.addEventListener(
            "scroll",
            (event) => {
                if (event.target instanceof HTMLElement && event.target.matches(selector))
                    record("scroll", geometry(event.target));
            },
            { capture: true, passive: true }
        );

        // 挂载观察只覆盖真实视窗，后台测量副本不产生正文挂载事件。
        let viewport: HTMLElement | null = null;
        const contentObserver = new MutationObserver((changes) => {
            if (!viewport) return;
            record("viewport-child-list", {
                ...geometry(viewport),
                changes: changes.length,
                addedNodes: changes.reduce((count, change) => count + change.addedNodes.length, 0),
                removedNodes: changes.reduce((count, change) => count + change.removedNodes.length, 0),
                directChildren: viewport.childElementCount,
            });
        });

        /**
         * 页面替换时观察新的真实视窗，离开阅读器即断开旧节点。
         */
        function observeViewport(): void {
            const current = document.querySelector<HTMLElement>(selector);
            if (current === viewport) return;
            contentObserver.disconnect();
            viewport = current;
            if (current) {
                record("viewport-mounted", geometry(current));
                contentObserver.observe(current, { childList: true, subtree: true });
            } else record("viewport-unmounted", null);
        }

        /**
         * 应用根节点只观察页面替换，避免旁观后台测量树的每次变化。
         */
        function observeApp(): void {
            const app = document.querySelector("#app");
            if (!app) return;
            new MutationObserver(observeViewport).observe(app, { childList: true });
            observeViewport();
        }
        if (document.readyState === "loading")
            document.addEventListener("DOMContentLoaded", observeApp, { once: true });
        else observeApp();

        // 原生 put 先执行并原样返回请求；附加监听不覆盖应用的 onsuccess/oncomplete。
        const transactions = new WeakMap<IDBTransaction, number>();
        let transactionSequence = 0;
        let requestSequence = 0;
        // eslint-disable-next-line @typescript-eslint/unbound-method -- 保存原生方法，调用时显式保留实际 store 接收者。
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
            const request = put.call(this, value, key);
            if (this.name !== "progress") return request;
            const transaction = this.transaction;
            let transactionId = transactions.get(transaction);
            if (transactionId === undefined) {
                transactionId = ++transactionSequence;
                transactions.set(transaction, transactionId);
                const id = transactionId;
                transaction.addEventListener(
                    "complete",
                    () => {
                        record("progress-transaction-complete", { transactionId: id });
                    },
                    { once: true }
                );
            }
            const requestId = ++requestSequence;
            const saved =
                value !== null && typeof value === "object"
                    ? {
                          bookId: "bookId" in value ? value.bookId : undefined,
                          chapterNumber: "chapterNumber" in value ? value.chapterNumber : undefined,
                          blockNumber: "blockNumber" in value ? value.blockNumber : undefined,
                          contentOffset: "contentOffset" in value ? value.contentOffset : undefined,
                      }
                    : value;
            record("progress-put", { transactionId, requestId, value: saved, key });
            request.addEventListener(
                "success",
                () => {
                    record("progress-request-success", { transactionId, requestId });
                },
                { once: true }
            );
            return request;
        };
    });
}
