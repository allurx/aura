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

import "./style/base.css";
import "./component/dialog/dialog.css";
import "./component/overlay/overlay.css";
import "./setting/setting-ui.css";
import { PageName } from "./constant/page-name";
import type Page from "./page/page";
import Bookshelf from "./page/bookshelf/bookshelf";
import Reader from "./page/reader/reader";
import Router, { type AppRoute } from "./router/router";
import { assertExists } from "./util/assert-util";
import favicon from "./asset/image/favicon.svg";

/**
 * SPA应用入口。
 * @author allurx
 */
class Main {
    private readonly appRoot: HTMLElement;
    private readonly router: Router;
    private currentPage: Page | null = null;

    public constructor() {
        assertExists(document.querySelector<HTMLLinkElement>("#favicon")).href = favicon;
        this.appRoot = assertExists(document.querySelector<HTMLElement>("#app"));
        this.router = new Router((route) => this.render(route));
    }

    public start(): void {
        this.router.start();
    }

    private async render(route: AppRoute): Promise<void> {
        this.currentPage?.dispose();
        this.currentPage = this.createPage(route);
        await this.currentPage.mount(this.appRoot);
    }

    private createPage(route: AppRoute): Page {
        switch (route.pageName) {
            case PageName.BOOKSHELF:
                return new Bookshelf((bookId) => {
                    this.router.navigateToReader(bookId);
                });
            case PageName.READER:
                return new Reader(route.bookId);
        }
    }
}

new Main().start();
