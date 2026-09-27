/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import "./styles/base.css";
import "./styles/panel-scroll.css";
import "./styles/focus.css";
import "./components/icon/icon.css";
import "./components/dialog/dialog.css";
import "./components/overlay/overlay.css";
import "./settings/setting-ui.css";
import { PageName } from "./constants/page-name";
import type Page from "./pages/page";
import Bookshelf from "./pages/bookshelf/bookshelf";
import Reader from "./pages/reader/reader";
import Router, { type AppRoute } from "./router/router";
import { assertExists } from "./utils/assert-util";
import favicon from "./assets/images/favicon.svg";
import Dialog from "./components/dialog/dialog";
import OperationError from "./errors/operation-error";

/**
 * SPA应用入口。
 * @author allurx
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
        assertExists(document.querySelector<HTMLLinkElement>("#favicon")).href = favicon;
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

        // 错误处理就绪后再加载初始路由。
        this.router.start();
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
            const guidance =
                primaryCause instanceof DOMException && primaryCause.name === "QuotaExceededError"
                    ? "浏览器存储空间不足，操作未完成。请保留原始 TXT，释放存储空间后重试。"
                    : "操作未完成。请重试；若仍然失败，请保留原始 TXT，并检查浏览器是否允许本地存储。";
            const content =
                error instanceof OperationError ? `${error.message}\n\n${guidance}\n\n${error.details}` : guidance;
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
