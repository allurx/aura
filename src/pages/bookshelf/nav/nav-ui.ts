/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Category from "@/domain/category/category";
import { bind, delegate } from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import Ui from "@/components/ui";

/**
 * 桌面分类侧栏与移动端原生模态抽屉。
 */
export default class NavUi extends Ui {
    private readonly navigation = assertExists(this.root.querySelector<HTMLElement>("#category-navigation"));
    private readonly drawer = assertExists(this.root.closest<HTMLDialogElement>("dialog"));
    private readonly page = assertExists(this.root.closest<HTMLElement>("#bookshelf"));
    private readonly opener = assertExists(this.page.querySelector<HTMLButtonElement>("#open-navigation"));
    private readonly mobile = window.matchMedia("(max-width: 768px)");

    /**
     * 渲染虚拟全部书籍入口以及原有分类。
     */
    public renderNav(categories: Category[], activeId: string): void {
        this.navigation.replaceChildren();

        // 虚拟“全部书籍”排在真实分类之前，保持默认浏览入口。
        for (const category of [{ id: "", name: "全部书籍" }, ...categories.toSorted((a, b) => a.order - b.order)]) {
            // 按钮保存分类 ID，点击不依赖名称或装饰节点。
            const button = document.createElement("button");
            button.type = "button";
            button.dataset["id"] = category.id;

            // 标记只区分入口样式，分类名称由文本节点提供。
            const marker = document.createElement("span");
            marker.className = category.id ? "category-dot" : "icon icon-book";
            marker.setAttribute("aria-hidden", "true");
            const name = document.createElement("span");
            name.textContent = category.name;

            button.append(marker, name);
            this.navigation.append(button);
        }

        this.setActive(activeId);
    }

    /**
     * 更新选中状态，不将外部标识符拼接进选择器。
     */
    public setActive(categoryId: string): void {
        for (const button of this.navigation.querySelectorAll("button")) {
            const active = button.dataset["id"] === categoryId;
            button.classList.toggle("active", active);
            if (active) button.setAttribute("aria-current", "page");
            else button.removeAttribute("aria-current");
        }
    }

    /**
     * 绑定分类与底部操作，原生 dialog 负责移动端的 Tab 和 Escape。
     */
    public bindEvents(
        handlers: {
            category: (categoryId: string) => void;
            clear: () => Promise<void>;
        },
        signal: AbortSignal
    ): void {
        // 初始化及旋转、缩放时同步桌面侧栏和移动模态抽屉。
        this.syncBreakpoint();
        this.mobile.addEventListener(
            "change",
            () => {
                this.syncBreakpoint();
            },
            { signal }
        );

        // 打开入口只在移动断点生效，并同步可访问的展开状态。
        bind(
            this.opener,
            "click",
            () => {
                if (!this.mobile.matches || this.drawer.open) return;
                this.drawer.showModal();
                this.opener.setAttribute("aria-expanded", "true");
            },
            { signal }
        );

        // 关闭按钮、抽屉外沿点击与原生关闭事件共用收起状态。
        bind(
            assertExists(this.root.querySelector("#close-navigation")),
            "click",
            () => {
                this.closeDrawer();
            },
            {
                signal,
            }
        );
        bind(
            this.drawer,
            "click",
            (event) => {
                if (event.target === this.drawer) this.closeDrawer();
            },
            { signal }
        );
        bind(
            this.drawer,
            "close",
            () => {
                this.opener.setAttribute("aria-expanded", "false");
            },
            { signal }
        );

        // 切换分类后收起移动抽屉，让用户直接浏览新结果。
        delegate(
            this.navigation,
            "button",
            "click",
            (_, button) => {
                handlers.category(assertExists(button.dataset["id"]));
                this.closeDrawer();
            },
            { signal }
        );

        // 清空流程先退出当前模态，避免遮罩与确认对话框冲突。
        bind(
            assertExists(this.root.querySelector("#clear-btn")),
            "click",
            async () => {
                this.closeDrawer();
                await handlers.clear();
            },
            { signal }
        );

        // 关于窗口集中展示项目链接与内嵌许可，离线查看声明不读取书籍或外部资源。
        const about = assertExists(document.querySelector<HTMLDialogElement>("#about-dialog"));
        const aboutButton = assertExists(this.root.querySelector<HTMLButtonElement>("#open-about"));
        bind(
            aboutButton,
            "click",
            () => {
                this.closeDrawer();
                about.showModal();
            },
            { signal }
        );
        bind(
            about,
            "keydown",
            (event: KeyboardEvent) => {
                // 侧栏跨断点重新展开会干扰原生关闭请求；Escape 只关闭当前关于窗口。
                if (event.key !== "Escape" || event.defaultPrevented) return;
                event.preventDefault();
                event.stopPropagation();
                about.close();
            },
            { signal }
        );
        bind(
            about,
            "close",
            () => {
                this.syncBreakpoint();
                (this.mobile.matches ? this.opener : aboutButton).focus();
            },
            { signal }
        );

        // 页面退出时释放原生模态状态，不留下顶层遮罩。
        signal.addEventListener(
            "abort",
            () => {
                this.drawer.close();
                about.close();
            },
            { once: true }
        );
    }

    /**
     * 关闭移动抽屉并恢复至仍可见的菜单入口。
     */
    private closeDrawer(): void {
        if (!this.mobile.matches || !this.drawer.open) return;
        this.drawer.close();
        this.opener.setAttribute("aria-expanded", "false");
        this.opener.focus();
    }

    /**
     * 断点变化先退出模态状态，避免桌面残留遮罩或背景不可交互。
     */
    private syncBreakpoint(): void {
        const focusedInside = this.drawer.contains(document.activeElement);
        this.opener.setAttribute("aria-expanded", "false");
        if (this.mobile.matches) {
            this.drawer.close();
            if (focusedInside) this.opener.focus();
        } else {
            if (this.drawer.matches(":modal")) this.drawer.close();
            // 桌面仅作侧栏展示，避免非模态 show() 自动移动当前焦点。
            this.drawer.open = true;
            if (document.activeElement === this.opener)
                this.navigation.querySelector<HTMLButtonElement>(".active")?.focus();
        }
    }
}
