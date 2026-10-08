/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { PageName } from "./constants/page-name";
import type Page from "./pages/page";
import Bookshelf from "./pages/bookshelf/bookshelf";
import Reader from "./pages/reader/reader";
import Router, { type AppRoute } from "./router/router";
import { assertExists } from "./utils/assert-util";
import Dialog from "./components/dialog/dialog";
import { createErrorContent } from "./components/dialog/error-content";
import { run } from "./utils/event-util";

/**
 * 管理页面替换和统一错误提示，页面实例随路由切换创建与销毁。
 */
class Main {
    private readonly appRoot: HTMLElement;
    private readonly router: Router;
    private currentPage: Page | null = null;
    private renderVersion = 0;
    private readonly errorDialog = new Dialog({ containerElement: document.body });
    private errorVisible = false;

    /**
     * 准备应用挂载节点与路由，页面实例由路由分发时创建。
     */
    public constructor() {
        this.appRoot = assertExists(document.querySelector<HTMLElement>("#app"));
        this.router = new Router((route) => this.render(route));
    }

    /**
     * 在启动路由前接入统一错误提示，覆盖首个页面的异步初始化失败。
     */
    public async start(): Promise<void> {
        // 同步错误和未处理的 Promise 拒绝共用一个用户提示入口。
        window.addEventListener("error", (event) => {
            void this.showError(event.error);
        });
        window.addEventListener("unhandledrejection", (event) => {
            void this.showError(event.reason);
        });

        // module 与 DOMContentLoaded 不保证外链样式已经可用；仅在样式尚未就绪时等待加载结束。
        // portable 已内联样式，直接初始化。失败样式仍由实际计算值检查和统一错误路径报告。
        const styles = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')];
        if (styles.some((link) => !link.sheet) && document.readyState !== "complete") {
            await new Promise<void>((resolve) => {
                window.addEventListener(
                    "load",
                    () => {
                        resolve();
                    },
                    { once: true }
                );
            });
        }
        this.router.start();
    }

    /**
     * 同时只显示一个错误提示；不阻止原始错误继续进入浏览器控制台。
     */
    private async showError(error: unknown): Promise<void> {
        if (this.errorVisible) return;
        this.errorVisible = true;
        try {
            const { title, content } = createErrorContent(error);
            await this.errorDialog.alert(content, { title, confirmBtnText: "知道了", tone: "error" });
        } finally {
            this.errorVisible = false;
        }
    }

    /**
     * 页面替换前结束旧生命周期，避免遗留监听器和异步任务继续操作界面。
     */
    private async render(route: AppRoute): Promise<void> {
        const version = ++this.renderVersion;
        const replacePage = async (): Promise<void> => {
            // 原生过渡会延迟 DOM 更新，快速导航时只挂载最新请求。
            if (version !== this.renderVersion) return;
            this.currentPage?.dispose();
            this.currentPage = this.createPage(route);
            await this.currentPage.mount(this.appRoot);
        };

        // 新页面和阅读位置准备好后再淡入，首次加载与减少动效模式直接呈现。
        if (
            this.currentPage &&
            typeof document.startViewTransition === "function" &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            const transition = document.startViewTransition(replacePage);
            // 快速导航或视口变化可能取消快照动画；DOM 更新失败仍由下面两个 Promise 传播。
            void transition.ready.catch(() => undefined);
            await Promise.all([transition.updateCallbackDone, transition.finished]);
        } else await replacePage();
    }

    /**
     * 页面只接收导航回调，由应用入口统一持有路由状态。
     */
    private createPage(route: AppRoute): Page {
        switch (route.pageName) {
            case PageName.BOOKSHELF:
                return new Bookshelf((bookId) => {
                    this.router.navigateToReader(bookId);
                });
            case PageName.READER:
                return new Reader(route.bookId, (missingBook) => {
                    if (missingBook) this.router.discardReader();
                    else this.router.navigateToBookshelf();
                });
        }
    }
}

run(() => new Main().start());
