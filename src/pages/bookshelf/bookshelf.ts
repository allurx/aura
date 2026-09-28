/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import template from "./bookshelf.html?raw";
import BasePage from "@/pages/base-page";
import BookshelfController from "./bookshelf-controller";

/**
 * 书架页面。
 */
export default class Bookshelf extends BasePage {
    public constructor(private readonly onReadBook: (bookId: string) => void) {
        super(template);
    }

    protected override async init(bookshelfRoot: HTMLElement): Promise<void> {
        await new BookshelfController(bookshelfRoot, this.onReadBook).init(this.lifecycleController.signal);
    }
}
