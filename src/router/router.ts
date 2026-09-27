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

import { PageName } from "@/constants/page-name";
import EventUtil from "@/utils/event-util";

/**
 * 页面路由及其必需上下文；阅读器必须关联具体书籍。
 */
export type AppRoute =
    | { readonly pageName: PageName.BOOKSHELF }
    | { readonly pageName: PageName.READER; readonly bookId: string };

/**
 * 应用Hash路由。
 * @author allurx
 */
export default class Router {
    private static readonly READER_BOOK_ID_KEY = "aura.router.reader.bookId";

    private listenerController: AbortController | null = null;

    public constructor(private readonly handler: (route: AppRoute) => Promise<void>) {}

    /**
     * 首次启动时绑定 Hash 变化并分发当前路由；重复启动不增加监听器。
     */
    public start(): void {
        if (this.listenerController) return;

        // 同一生命周期内复用一个监听器，stop 可以统一撤销。
        this.listenerController = new AbortController();
        window.addEventListener(
            "hashchange",
            () => {
                this.handleHashChange();
            },
            { signal: this.listenerController.signal }
        );

        // 页面首次打开没有 hashchange，主动恢复当前地址对应的页面。
        this.handleHashChange();
    }

    /**
     * 停止地址监听，保留浏览器地址和当前标签页的阅读上下文。
     */
    public stop(): void {
        this.listenerController?.abort();
        this.listenerController = null;
    }

    /**
     * 返回书架；replace 用于纠正无效路由，避免新增无效历史记录。
     */
    public navigateToBookshelf(replace = false): void {
        this.navigate(`#/${PageName.BOOKSHELF}`, replace);
    }

    /**
     * 先将书籍标识保存在当前标签页，再进入共用的阅读器地址。
     */
    public navigateToReader(bookId: string): void {
        if (!bookId) throw new Error("bookId must not be empty");

        sessionStorage.setItem(Router.READER_BOOK_ID_KEY, bookId);
        this.navigate(`#/${PageName.READER}`);
    }

    /**
     * 同址与历史替换需要主动分发，其余地址变化由 hashchange 处理。
     */
    private navigate(hash: string, replace = false): void {
        if (window.location.hash === hash) {
            // 同一路由的业务状态可能已经变化，例如切换正在阅读的书籍。
            this.handleHashChange();
            return;
        }

        if (replace) {
            // replaceState 不触发 hashchange；主动分发可同时避免 file: 下的文档级重新导航。
            window.history.replaceState(null, "", hash);
            this.handleHashChange();
            return;
        }

        window.location.hash = hash;
    }

    /**
     * 解析页面和会话上下文；未知地址或缺少书籍标识时回到书架。
     */
    private handleHashChange(): void {
        if (window.location.hash === `#/${PageName.BOOKSHELF}`) {
            this.dispatch({ pageName: PageName.BOOKSHELF });
            return;
        }

        if (window.location.hash === `#/${PageName.READER}`) {
            const bookId = sessionStorage.getItem(Router.READER_BOOK_ID_KEY);
            if (bookId) {
                this.dispatch({ pageName: PageName.READER, bookId });
                return;
            }
        }

        // 非法路由或缺少阅读上下文时替换为书架，避免污染浏览器历史记录。
        this.navigateToBookshelf(true);
    }

    /**
     * 将页面加载异常交给统一事件错误处理路径。
     */
    private dispatch(route: AppRoute): void {
        EventUtil.run(() => this.handler(route));
    }
}
