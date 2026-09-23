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

    public start(): void {
        if (this.listenerController) return;

        this.listenerController = new AbortController();
        window.addEventListener(
            "hashchange",
            () => {
                this.handleHashChange();
            },
            { signal: this.listenerController.signal }
        );
        this.handleHashChange();
    }

    public stop(): void {
        this.listenerController?.abort();
        this.listenerController = null;
    }

    public navigateToBookshelf(replace = false): void {
        this.navigate(`#/${PageName.BOOKSHELF}`, replace);
    }

    public navigateToReader(bookId: string): void {
        if (!bookId) throw new Error("bookId must not be empty");

        sessionStorage.setItem(Router.READER_BOOK_ID_KEY, bookId);
        this.navigate(`#/${PageName.READER}`);
    }

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

    private dispatch(route: AppRoute): void {
        EventUtil.run(() => this.handler(route));
    }
}
