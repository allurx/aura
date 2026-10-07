/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import "./styles/base.css";
import "./styles/motion.css";
import "./styles/panel-scroll.css";
import "./styles/focus.css";
import "./styles/select.css";
import "./components/icon/icon.css";
import "./components/search-field/search-field.css";
import "./components/dialog/dialog.css";
import "./components/license/license.css";
import "./components/overlay/overlay.css";
import "./settings/setting-ui.css";
import { PageName } from "./constants/page-name";
import type Page from "./pages/page";
import Bookshelf from "./pages/bookshelf/bookshelf";
import Reader from "./pages/reader/reader";
import Router, { type AppRoute } from "./router/router";
import { assertExists } from "./utils/assert-util";
import Dialog from "./components/dialog/dialog";
import OperationError from "./errors/operation-error";

/**
 * 管理页面替换和统一错误提示，页面实例随路由切换创建与销毁。
 */
class Main {
    private readonly appRoot: HTMLElement;
    private readonly router: Router;
    private currentPage: Page | null = null;
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
    public start(): void {
        // 同步错误和未处理的 Promise 拒绝共用一个用户提示入口。
        window.addEventListener("error", (event) => {
            void this.showError(event.error);
        });
        window.addEventListener("unhandledrejection", (event) => {
            void this.showError(event.reason);
        });

        // 默认外观读取计算样式；部分浏览器会先执行模块，再完成后置样式表的加载。
        if (document.readyState === "complete") this.router.start();
        else
            window.addEventListener(
                "load",
                () => {
                    this.router.start();
                },
                { once: true }
            );
    }

    /**
     * 同时只显示一个错误提示；不阻止原始错误继续进入浏览器控制台。
     */
    private async showError(error: unknown): Promise<void> {
        if (this.errorVisible) return;
        this.errorVisible = true;
        try {
            // 业务层只补充可读上下文，通用原因与展示仍由统一错误入口负责。
            const cause = error instanceof OperationError ? error.cause : error;
            const primaryCause = cause instanceof AggregateError ? cause.cause : cause;
            const storageGuidance =
                primaryCause instanceof DOMException && primaryCause.name === "QuotaExceededError"
                    ? "浏览器存储空间不足，操作未完成。请保留原始书籍文件，释放存储空间后重试。"
                    : undefined;
            const content =
                error instanceof OperationError
                    ? [error.message, error.details, storageGuidance].filter(Boolean).join("\n\n")
                    : (storageGuidance ?? "操作未完成。请重试；若仍然失败，请保留原始书籍文件。");
            await this.errorDialog.alert(content, { title: "操作失败" });
        } finally {
            this.errorVisible = false;
        }
    }

    /**
     * 页面替换前结束旧生命周期，避免遗留监听器和异步任务继续操作界面。
     */
    private async render(route: AppRoute): Promise<void> {
        this.currentPage?.dispose();
        this.currentPage = this.createPage(route);
        await this.currentPage.mount(this.appRoot);
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
                return new Reader(route.bookId, () => {
                    this.router.navigateToBookshelf();
                });
        }
    }
}

new Main().start();
