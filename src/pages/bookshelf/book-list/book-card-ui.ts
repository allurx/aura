/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import Ui from "@/components/ui";
import { CATEGORIES } from "@/domain/category/category";
import type { BookSummary } from "../bookshelf-service";

/**
 * 单本书的稳定界面节点；摘要更新只改变显示内容，操作与窗口生命周期由书目列表管理。
 */
export default class BookCardUi extends Ui {
    private readonly open = document.createElement("button");
    private readonly title = document.createElement("span");
    private readonly progress = document.createElement("p");
    private readonly move = this.createAction("book-move", "移动分类", "icon-move-category");
    private readonly remove = this.createAction("book-delete", "删除书籍", "icon-delete");
    private readonly exportButton = this.createAction("book-export", "导出原文件", "icon-download");
    private readonly categoryOptions = new Map<string, HTMLButtonElement>();
    private readonly actions = document.createElement("div");
    private readonly more = document.createElement("button");
    private summary: BookSummary | undefined;

    public constructor(summary: BookSummary) {
        super(document.createElement("article"));

        // 稳定标识供事件委托与窗口定位使用，颜色不随分类和筛选改变。
        this.root.className = "book";
        this.root.setAttribute("role", "listitem");
        this.root.dataset["id"] = summary.book.id;
        this.root.style.setProperty("--book-cover-hue", String(this.coverHue(summary.book.id)));

        // 书封承载完整阅读入口；标题与装饰继续使用原有布局。
        this.open.type = "button";
        this.open.className = "book-open";
        this.title.className = "book-title";
        const cover = document.createElement("span");
        cover.className = "book-cover";
        cover.append(this.title);
        this.open.append(cover);

        const details = document.createElement("div");
        details.className = "book-details";
        this.progress.className = "book-progress";

        // 第一层只呈现同级动作，分类选择在同一浮层内展开。
        const actionList = document.createElement("div");
        actionList.className = "book-action-list panel-scroll";
        this.move.autofocus = true;
        const nextIcon = document.createElement("span");
        nextIcon.className = "icon icon-chevron book-action-next";
        nextIcon.setAttribute("aria-hidden", "true");
        this.move.append(nextIcon);
        this.remove.title = "删除书籍";
        this.exportButton.title = "导出原文件";
        const divider = document.createElement("hr");
        divider.className = "book-action-divider";
        actionList.append(this.move, this.exportButton, divider, this.remove);

        // 返回栏保持固定，完整分类列表只在内部滚动；勾选由已提交摘要更新。
        const categories = document.createElement("div");
        categories.className = "book-categories";
        categories.hidden = true;
        const categoryHeader = document.createElement("header");
        categoryHeader.className = "book-category-header panel-scroll";
        const back = this.createAction("book-actions-back", "移动分类", "icon-arrow-left");
        back.setAttribute("aria-label", "返回书籍操作");
        categoryHeader.append(back);
        const categoryList = document.createElement("div");
        categoryList.className = "book-category-list panel-scroll";
        categoryList.setAttribute("role", "group");
        categoryList.setAttribute("aria-label", "目标分类");
        for (const category of CATEGORIES) {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "book-category-option book-action";
            option.dataset["categoryId"] = category.id;
            const label = document.createElement("span");
            label.textContent = category.name;
            const check = document.createElement("span");
            check.className = "icon icon-check";
            check.setAttribute("aria-hidden", "true");
            option.append(label, check);
            this.categoryOptions.set(category.id, option);
            categoryList.append(option);
        }
        categories.append(categoryHeader, categoryList);

        this.actions.id = `book-actions-${summary.book.id}`;
        this.actions.className = "book-actions";
        this.actions.popover = "auto";
        this.actions.setAttribute("role", "group");
        this.actions.append(actionList, categories);

        this.more.type = "button";
        this.more.className = "book-more icon-button";
        this.more.popoverTargetElement = this.actions;
        this.more.title = "更多操作";
        const moreIcon = document.createElement("span");
        moreIcon.className = "icon icon-more";
        moreIcon.setAttribute("aria-hidden", "true");
        this.more.append(moreIcon);

        details.append(this.progress, this.more, this.actions);
        this.root.append(this.open, details);
        this.update(summary);
    }

    /**
     * 应用同一书籍 ID 的新摘要；保留节点、焦点和操作浮层。
     * 分类勾选只随已提交摘要变化，保存失败不会提前改变归属。
     */
    public update(summary: BookSummary): void {
        const previous = this.summary;
        const titleChanged = previous?.title !== summary.title;
        if (titleChanged) {
            this.title.textContent = summary.title;
            this.move.setAttribute("aria-label", `移动《${summary.title}》到分类`);
            this.remove.setAttribute("aria-label", `删除《${summary.title}》`);
            this.exportButton.setAttribute("aria-label", `导出《${summary.title}》原文件`);
            this.actions.setAttribute("aria-label", `《${summary.title}》的书籍操作`);
            this.more.setAttribute("aria-label", `《${summary.title}》的更多操作`);
        }
        if (previous?.book.fileName !== summary.book.fileName) this.open.title = summary.book.fileName;

        const progressChanged =
            !previous ||
            previous.progress?.chapterNumber !== summary.progress?.chapterNumber ||
            previous.progress?.chapterCount !== summary.progress?.chapterCount;
        if (titleChanged || progressChanged) {
            const progressLabel = summary.progress
                ? `第 ${String(summary.progress.chapterNumber)} / ${String(summary.progress.chapterCount)} 章`
                : "暂无阅读位置";
            this.open.setAttribute("aria-label", `阅读《${summary.title}》，${progressLabel}`);
            if (progressChanged) {
                this.progress.textContent = summary.progress
                    ? `${String(summary.progress.chapterNumber)}/${String(summary.progress.chapterCount)}`
                    : "暂无进度";
                this.progress.title = progressLabel;
            }
        }

        if (previous?.book.categoryId !== summary.book.categoryId) {
            for (const [id, option] of this.categoryOptions)
                option.setAttribute("aria-pressed", String(id === summary.book.categoryId));
        }
        this.summary = summary;
    }

    /**
     * 书籍动作共用图标和文字结构，避免不同入口形成各自的排版。
     */
    private createAction(className: string, label: string, icon: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `book-action ${className}`;
        const symbol = document.createElement("span");
        symbol.className = `icon ${icon}`;
        symbol.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.textContent = label;
        button.append(symbol, text);
        return button;
    }

    /**
     * 将稳定书籍标识映射到完整色相环。
     */
    private coverHue(bookId: string): number {
        let hash = 0;
        for (const character of bookId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        return hash % 360;
    }
}
