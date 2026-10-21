/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Page } from "playwright-core";
import {
    importBooks,
    openBook,
    startBrowserTests,
    stopBrowserTests,
    textBook,
    waitForBookCount,
    withPage,
} from "./browser-test-support.ts";

before(startBrowserTests);
after(stopBrowserTests);

interface StorageSnapshot {
    version: number;
    stores: Record<string, unknown[]>;
    local: Record<string, string | null>;
    session: Record<string, string | null>;
}

/**
 * 在隔离上下文中创建固定记录，分别覆盖额外 store、缺少必需 store 和更高版本。
 */
async function seedLibrary(
    page: Page,
    version: number,
    variant: "current" | "extra-store" | "missing-store" = "current"
): Promise<void> {
    await page.evaluate(
        async ({ version, variant }) => {
            // 应用收到 versionchange 后关闭连接；没有用户资料参与这次测试库替换。
            await new Promise<void>((resolve, reject) => {
                const request = indexedDB.deleteDatabase("aura");
                request.onsuccess = () => {
                    resolve();
                };
                request.onerror = () => {
                    reject(request.error ?? new Error("Unable to replace the empty test database"));
                };
            });
            const source = new Blob(["第一章 保留\n旧数据请保留。"], { type: "text/plain" });
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await source.arrayBuffer())))
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join("");
            const database = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open("aura", version);
                request.onupgradeneeded = () => {
                    const database = request.result;
                    database
                        .createObjectStore("file", { keyPath: "id" })
                        .createIndex("byFormatAndHash", ["format", "hash"], { unique: true });
                    database.createObjectStore("book", { keyPath: "id" }).createIndex("byFileId", "fileId");
                    database.createObjectStore("toc", { keyPath: "fileId" });
                    if (variant !== "missing-store")
                        database
                            .createObjectStore("chapter", { keyPath: ["fileId", "chapterNumber"] })
                            .createIndex("byFileId", "fileId");
                    database.createObjectStore("progress", { keyPath: "bookId" });
                    if (variant === "extra-store") database.createObjectStore("unused-store", { keyPath: "id" });
                };
                request.onsuccess = () => {
                    resolve(request.result);
                };
                request.onerror = () => {
                    reject(request.error ?? new Error("Unable to seed the test library"));
                };
            });
            try {
                await new Promise<void>((resolve, reject) => {
                    const transaction = database.transaction([...database.objectStoreNames], "readwrite");
                    transaction.objectStore("file").put({ id: "retained-file", hash, format: "txt", source });
                    transaction.objectStore("book").put({
                        id: "retained-book",
                        fileId: "retained-file",
                        fileName: "retained.txt",
                        categoryId: "fiction",
                        createdTime: 1,
                    });
                    if (variant !== "missing-store")
                        transaction.objectStore("chapter").put({
                            kind: "text",
                            fileId: "retained-file",
                            chapterNumber: 1,
                            title: "第一章 保留",
                            startPosition: 1,
                            endPosition: 2,
                            lines: ["旧数据请保留。"],
                        });
                    transaction.objectStore("toc").put({
                        fileId: "retained-file",
                        entries: [{ chapterNumber: 1, title: "第一章 保留", startPosition: 1, endPosition: 2 }],
                    });
                    transaction
                        .objectStore("progress")
                        .put({ bookId: "retained-book", chapterNumber: 1, blockNumber: 1, contentOffset: 2 });
                    if (variant === "extra-store")
                        transaction.objectStore("unused-store").put({ id: "retained-extra", value: "extra marker" });
                    transaction.oncomplete = () => {
                        resolve();
                    };
                    transaction.onabort = () => {
                        reject(transaction.error ?? new Error("Unable to commit the test library"));
                    };
                });
                localStorage.setItem(
                    "aura.bookshelf.appearance",
                    JSON.stringify({ theme: "breeze", general: {}, panels: {} })
                );
                localStorage.setItem(
                    "aura.reader.appearance",
                    JSON.stringify({ theme: "paper", general: { "font-size": "23px" }, panels: {} })
                );
                localStorage.setItem("retained-local-data", "local marker");
                sessionStorage.setItem("retained-session-data", "session marker");
            } finally {
                database.close();
            }
        },
        { version, variant }
    );
}

/**
 * 直接回读测试库，不调用应用连接入口；同时核对 Blob 字节和两类本地存储。
 */
async function readSnapshot(page: Page): Promise<StorageSnapshot> {
    return page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("aura");
            request.onsuccess = () => {
                resolve(request.result);
            };
            request.onerror = () => {
                reject(request.error ?? new Error("Unable to inspect the test library"));
            };
        });
        try {
            const serialize = async (value: unknown): Promise<unknown> => {
                if (value instanceof Blob)
                    return { type: value.type, bytes: Array.from(new Uint8Array(await value.arrayBuffer())) };
                if (Array.isArray(value)) return Promise.all(value.map(serialize));
                if (value && typeof value === "object")
                    return Object.fromEntries(
                        await Promise.all(
                            Object.entries(value).map(async ([key, item]) => [key, await serialize(item)])
                        )
                    );
                return value;
            };
            const stores: Record<string, unknown[]> = {};
            for (const name of [...database.objectStoreNames]) {
                const records = await new Promise<unknown[]>((resolve, reject) => {
                    const request = database.transaction(name).objectStore(name).getAll();
                    request.onsuccess = () => {
                        resolve(request.result);
                    };
                    request.onerror = () => {
                        reject(request.error ?? new Error("Unable to read test records"));
                    };
                });
                stores[name] = await Promise.all(records.map(serialize));
            }
            return {
                version: database.version,
                stores,
                local: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
                session: Object.fromEntries(
                    Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])
                ),
            };
        } finally {
            database.close();
        }
    });
}

/**
 * 新初始化的当前库不含旧记录，重置还应清除所有站点及当前标签页的存储。
 */
function assertEmptyCurrent(snapshot: StorageSnapshot): void {
    assert.equal(snapshot.version, 1);
    assert.deepEqual(snapshot.stores, { book: [], chapter: [], file: [], progress: [], toc: [] });
    assert.deepEqual(snapshot.local, {});
    assert.deepEqual(snapshot.session, {});
}

for (const delivery of ["web", "portable"] as const) {
    for (const variant of ["current", "extra-store"] as const) {
        void test(`${delivery}: v1 records remain readable without rewriting the library (${variant})`, async () => {
            await withPage(delivery, async (page) => {
                assertEmptyCurrent(await readSnapshot(page));
                await seedLibrary(page, 1, variant);
                const before = await readSnapshot(page);
                const expectedStores = ["book", "chapter", "file", "progress", "toc"];
                if (variant === "extra-store") expectedStores.push("unused-store");
                assert.deepEqual(Object.keys(before.stores), expectedStores);
                await page.reload();
                await waitForBookCount(page, 1);
                assert.deepEqual(await readSnapshot(page), before);
                assert.equal(await page.locator("#import-books").isEnabled(), true);
                assert.equal(await page.locator(".shelf-data-error").count(), 0);
                await openBook(page, "retained.txt");
                assert.match((await page.locator("#content").textContent()) ?? "", /据请保留。/u);
            });
        });
    }

    void test(`${delivery}: unsupported data stays intact until reset is explicitly confirmed`, async () => {
        for (const { version, variant } of [
            { version: 1, variant: "missing-store" },
            { version: 2, variant: "current" },
        ] as const) {
            await withPage(delivery, async (page) => {
                assertEmptyCurrent(await readSnapshot(page));
                await seedLibrary(page, version, variant);
                const before = await readSnapshot(page);
                await page.reload();
                await page
                    .getByRole("heading", {
                        name: version === 1 ? "本地书库格式不兼容" : "书库版本高于当前支持范围",
                        exact: true,
                    })
                    .waitFor();
                assert.equal(await page.locator("dialog:modal").count(), 0);
                assert.deepEqual(await readSnapshot(page), before);
                if (version === 2) {
                    assert.equal(await page.locator(".shelf-reset").count(), 0);
                    return;
                }

                await page.locator(".shelf-reset").click();
                const confirm = page.getByRole("dialog", { name: "重置数据", exact: true });
                await confirm.getByRole("button", { name: "取消", exact: true }).click();
                assert.deepEqual(await readSnapshot(page), before);

                await page.locator(".shelf-reset").click();
                await confirm.getByRole("button", { name: "清除全部数据", exact: true }).click();
                await page.locator(".shelf-empty-import").waitFor();
                assertEmptyCurrent(await readSnapshot(page));
                const imported = textBook("after-reset.txt", 2);
                await importBooks(page, [imported]);
                await openBook(page, imported.name);
                assert.match(await page.locator("#content").innerText(), /测试章节/);
            });
        }
    });

    void test(`${delivery}: reset waits for an occupied old database without clearing storage early`, async () => {
        await withPage(delivery, async (page) => {
            await seedLibrary(page, 1, "missing-store");
            await page.reload();
            await page.getByRole("heading", { name: "本地书库格式不兼容", exact: true }).waitFor();

            // about:blank 弹出页继承测试页面 origin，只持有原生连接，不启动第二个 Aura。
            const opened = page.waitForEvent("popup");
            await page.evaluate(() => {
                window.open("about:blank", "_blank");
            });
            const blocker = await opened;
            const connection = await blocker.evaluateHandle(
                async () =>
                    new Promise<IDBDatabase>((resolve, reject) => {
                        const request = indexedDB.open("aura", 1);
                        request.onsuccess = () => {
                            request.result.onversionchange = () => {
                                document.documentElement.setAttribute("data-delete-requested", "true");
                            };
                            resolve(request.result);
                        };
                        request.onerror = () => {
                            reject(request.error ?? new Error("Unable to hold the old database open"));
                        };
                    })
            );
            try {
                await page.locator(".shelf-reset").click();
                await page
                    .getByRole("dialog", { name: "重置数据", exact: true })
                    .getByRole("button", { name: "清除全部数据", exact: true })
                    .click();
                await blocker.waitForFunction(() => document.documentElement.hasAttribute("data-delete-requested"));
                await page.locator(".overlay:not([hidden])").waitFor();
                const retainedFile = await connection.evaluate(async (database) => {
                    const source = await new Promise<Blob>((resolve, reject) => {
                        const request: IDBRequest<unknown> = database
                            .transaction("file")
                            .objectStore("file")
                            .get("retained-file");
                        request.onsuccess = () => {
                            const value = request.result;
                            if (value && typeof value === "object" && "source" in value && value.source instanceof Blob)
                                resolve(value.source);
                            else reject(new Error("The original file must remain available while reset is blocked"));
                        };
                        request.onerror = () => {
                            reject(request.error ?? new Error("Unable to inspect the blocked database"));
                        };
                    });
                    return source.text();
                });
                assert.equal(retainedFile, "第一章 保留\n旧数据请保留。");
                assert.deepEqual(
                    await page.evaluate(() => [
                        localStorage.getItem("retained-local-data"),
                        sessionStorage.getItem("retained-session-data"),
                    ]),
                    ["local marker", "session marker"]
                );
            } finally {
                await connection.dispose();
                await blocker.close();
            }
            await page.locator(".shelf-empty-import").waitFor();
            assertEmptyCurrent(await readSnapshot(page));
        });
    });

    void test(`${delivery}: a temporary read failure offers retry without treating data as incompatible`, async () => {
        await withPage(
            delivery,
            async (page) => {
                await importBooks(page, [textBook("retry.txt", 2)]);
                const before = await readSnapshot(page);
                await page.addInitScript(() => {
                    // eslint-disable-next-line @typescript-eslint/unbound-method -- 注入一次底层失败，随后恢复原方法并保留真实接收者。
                    const transaction = IDBDatabase.prototype.transaction;
                    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
                        const names = typeof args[0] === "string" ? [args[0]] : [...args[0]];
                        if (args[1] === "readonly" && names.includes("book")) {
                            IDBDatabase.prototype.transaction = transaction;
                            throw new DOMException("Test storage read failed", "UnknownError");
                        }
                        return transaction.apply(this, args);
                    };
                });
                await page.reload();
                const failure = page.getByRole("dialog", { name: "书架暂时无法读取", exact: true });
                await failure.waitFor();
                assert.doesNotMatch(await failure.innerText(), /重置|不兼容/u);
                assert.equal(await page.locator(".shelf-reset").count(), 0);
                await failure.getByRole("button", { name: "知道了", exact: true }).click();
                await page.getByRole("button", { name: "重新读取", exact: true }).click();
                await waitForBookCount(page, 1);
                assert.deepEqual(await readSnapshot(page), before);
            },
            ["书架暂时无法读取"]
        );
    });
}
