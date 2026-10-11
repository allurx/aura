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
    private readonly categorySelect = document.createElement("select");
    private readonly categoryLabel = document.createElement("span");
    private readonly remove = document.createElement("button");
    private readonly exportButton = document.createElement("button");
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

        // 分类选项只创建一次，更新摘要不关闭原生选择器或重建其选项。
        this.categorySelect.className = "book-category";
        this.categorySelect.id = `book-category-${summary.book.id}`;
        for (const category of CATEGORIES) {
            const option = document.createElement("option");
            option.value = category.id;
            option.textContent = category.name;
            this.categorySelect.append(option);
        }
        this.categoryLabel.className = "book-category-label";
        const categoryIcon = document.createElement("span");
        categoryIcon.className = "book-category-icon";
        categoryIcon.setAttribute("aria-hidden", "true");
        const chevron = document.createElement("span");
        chevron.className = "icon icon-chevron";
        categoryIcon.append(chevron);

        // 文件操作保留固定的 popover 和触发按钮，摘要变化不打断打开状态。
        this.remove.type = "button";
        this.remove.className = "book-delete book-action";
        this.remove.title = "删除书籍";
        const removeIcon = document.createElement("span");
        removeIcon.className = "icon icon-delete";
        removeIcon.setAttribute("aria-hidden", "true");
        const removeLabel = document.createElement("span");
        removeLabel.textContent = "删除";
        this.remove.append(removeIcon, removeLabel);

        this.exportButton.type = "button";
        this.exportButton.className = "book-export book-action";
        this.exportButton.title = "导出原文件";
        const exportIcon = document.createElement("span");
        exportIcon.className = "icon icon-download";
        exportIcon.setAttribute("aria-hidden", "true");
        const exportLabel = document.createElement("span");
        exportLabel.textContent = "导出";
        this.exportButton.append(exportIcon, exportLabel);

        this.actions.id = `book-actions-${summary.book.id}`;
        this.actions.className = "book-file-actions panel-scroll";
        this.actions.popover = "auto";
        this.actions.setAttribute("role", "group");
        this.exportButton.autofocus = true;
        this.actions.append(this.exportButton, this.remove);

        this.more.type = "button";
        this.more.className = "book-more icon-button";
        this.more.popoverTargetElement = this.actions;
        this.more.title = "更多操作";
        const moreIcon = document.createElement("span");
        moreIcon.className = "icon icon-more";
        moreIcon.setAttribute("aria-hidden", "true");
        this.more.append(moreIcon);

        details.append(this.progress, this.categoryLabel, this.categorySelect, categoryIcon, this.more, this.actions);
        this.root.append(this.open, details);
        this.update(summary);
    }

    /**
     * 应用同一书籍 ID 的新摘要；保留节点、焦点、选择器忙碌状态和文件菜单。
     * 分类只随已提交摘要变化，不能用未变化的旧摘要覆盖正在提交的选择。
     */
    public update(summary: BookSummary): void {
        const previous = this.summary;
        const titleChanged = previous?.title !== summary.title;
        if (titleChanged) {
            this.title.textContent = summary.title;
            this.categorySelect.setAttribute("aria-label", `移动《${summary.title}》到分类`);
            this.remove.setAttribute("aria-label", `删除《${summary.title}》`);
            this.exportButton.setAttribute("aria-label", `导出《${summary.title}》原文件`);
            this.actions.setAttribute("aria-label", `《${summary.title}》的文件操作`);
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
            this.categorySelect.dataset["categoryId"] = summary.book.categoryId;
            this.categorySelect.value = summary.book.categoryId;
            const category = this.categorySelect.selectedOptions[0]?.textContent ?? "";
            this.categorySelect.title = `当前分类：${category}。选择分类即可移动`;
            this.categoryLabel.textContent = category;
            this.categoryLabel.title = category;
        }
        this.summary = summary;
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
