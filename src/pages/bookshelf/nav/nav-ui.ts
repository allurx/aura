/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { CATEGORIES } from "@/domain/category/category";
import { bind, delegate } from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import Ui from "@/components/ui";
import enableLightDismiss from "@/components/dialog/light-dismiss";

/**
 * 桌面分类侧栏与移动端原生模态抽屉。
 */
export default class NavUi extends Ui {
    private readonly navigation = assertExists(this.root.querySelector<HTMLElement>("#category-navigation"));
    private readonly drawer = assertExists(this.root.closest<HTMLDialogElement>("dialog"));
    private readonly page = assertExists(this.root.closest<HTMLElement>("#bookshelf"));
    private readonly opener = assertExists(this.page.querySelector<HTMLButtonElement>("#open-navigation"));
    private readonly moreButton = assertExists(this.root.querySelector<HTMLButtonElement>("#open-more"));
    private readonly moreActions = assertExists(this.root.querySelector<HTMLElement>("#bookshelf-more-actions"));
    private readonly mobile = window.matchMedia("(max-width: 768px)");

    /**
     * 渲染虚拟全部书籍入口及完整固定目录，空分类也保持可达。
     */
    public renderNav(activeId: string): void {
        this.navigation.replaceChildren();

        // 虚拟“全部书籍”排在真实分类之前，保持默认浏览入口。
        for (const category of [{ id: "", name: "全部书籍" }, ...CATEGORIES]) {
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
            reset: () => Promise<void>;
        },
        signal: AbortSignal
    ): void {
        // 初始化及旋转、缩放时同步桌面侧栏和移动模态抽屉。
        enableLightDismiss(this.drawer, signal);
        this.syncBreakpoint();
        this.mobile.addEventListener(
            "change",
            () => {
                this.syncBreakpoint();
            },
            { signal }
        );

        // 原生 popover 管理显隐、外部点击和 Escape；定位跟随入口与可视区域。
        bind(
            this.moreActions,
            "beforetoggle",
            (event: ToggleEvent) => {
                if (event.newState === "open") this.positionMoreActions();
            },
            { signal }
        );
        bind(
            this.moreActions,
            "toggle",
            () => {
                if (this.moreActions.matches(":popover-open")) this.moreActions.scrollTop = 0;
            },
            { signal }
        );
        const repositionMoreActions = () => {
            if (this.moreActions.matches(":popover-open")) this.positionMoreActions();
        };
        window.addEventListener("resize", repositionMoreActions, { signal });
        window.visualViewport?.addEventListener("resize", repositionMoreActions, { signal });
        window.visualViewport?.addEventListener("scroll", repositionMoreActions, { signal });

        // 打开入口只在移动断点生效，并同步可访问的展开状态。
        bind(
            this.opener,
            "click",
            () => {
                if (!this.mobile.matches || this.drawer.open) return;
                this.drawer.inert = false;
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
            "cancel",
            (event) => {
                event.preventDefault();
                this.closeDrawer();
            },
            { signal }
        );
        bind(
            this.drawer,
            "close",
            () => {
                if (this.drawer.open) return;
                this.closeMoreActions();
                this.drawer.inert = this.mobile.matches;
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
                this.closeMoreActions();
                handlers.category(assertExists(button.dataset["id"]));
                this.closeDrawer();
            },
            { signal }
        );

        // 数据操作先退出当前模态，避免遮罩与确认对话框冲突。
        for (const [selector, handler] of [
            ["#clear-btn", handlers.clear],
            ["#reset-data", handlers.reset],
        ] as const) {
            bind(
                assertExists(this.root.querySelector(selector)),
                "click",
                async () => {
                    this.closeMoreActions();
                    this.closeDrawer();
                    this.focusMoreEntry();
                    try {
                        await handler();
                    } finally {
                        // 旧入口隐藏时，关闭中的 dialog 可能仍短暂持有焦点；成功后的列表焦点保持不变。
                        const focused = document.activeElement;
                        if (
                            !signal.aborted &&
                            ([document.body, this.opener, this.moreButton].some((element) => element === focused) ||
                                (focused instanceof HTMLElement && focused.closest("dialog:not([open])")))
                        ) {
                            this.syncBreakpoint();
                            this.focusMoreEntry();
                        }
                    }
                },
                { signal }
            );
        }

        // 关于窗口集中展示项目链接与内嵌许可，离线查看声明不读取书籍或外部资源。
        const about = assertExists(document.querySelector<HTMLDialogElement>("#about-dialog"));
        const aboutButton = assertExists(this.root.querySelector<HTMLButtonElement>("#open-about"));
        enableLightDismiss(about, signal);
        bind(
            aboutButton,
            "click",
            () => {
                this.closeMoreActions();
                this.closeDrawer();
                this.focusMoreEntry();
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
                this.focusMoreEntry();
            },
            { signal }
        );

        // 页面退出时释放原生模态状态，不留下顶层遮罩。
        signal.addEventListener(
            "abort",
            () => {
                this.closeMoreActions();
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
        this.closeMoreActions();
        this.drawer.close();
        this.drawer.inert = true;
        this.opener.setAttribute("aria-expanded", "false");
        this.opener.focus({ preventScroll: true });
    }

    /**
     * 断点变化先退出模态状态，避免桌面残留遮罩或背景不可交互。
     */
    private syncBreakpoint(): void {
        const focusedInside = this.drawer.contains(document.activeElement);
        this.closeMoreActions();
        this.opener.setAttribute("aria-expanded", "false");
        this.drawer.setAttribute("closedby", this.mobile.matches ? "any" : "none");
        if (this.mobile.matches) {
            this.drawer.close();
            this.drawer.inert = true;
            if (focusedInside) this.opener.focus({ preventScroll: true });
        } else {
            if (this.drawer.matches(":modal")) this.drawer.close();
            this.drawer.inert = false;
            // 桌面仅作侧栏展示，避免非模态 show() 自动移动当前焦点。
            this.drawer.open = true;
            if (document.activeElement === this.opener)
                this.navigation.querySelector<HTMLButtonElement>(".active")?.focus();
        }
    }

    /**
     * 更多操作沿入口上方展开，矮窗口只压缩并滚动操作内容。
     */
    private positionMoreActions(): void {
        const button = this.moreButton.getBoundingClientRect();
        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
        const width = Math.min(Math.max(button.width, 200), viewportWidth - 16);

        this.moreActions.style.width = `${width}px`;
        this.moreActions.style.left = `${Math.max(viewportLeft + 8, Math.min(button.left, viewportLeft + viewportWidth - width - 8))}px`;
        this.moreActions.style.bottom = `${window.innerHeight - button.top + 8}px`;
        this.moreActions.style.maxHeight = `${Math.max(0, button.top - viewportTop - 16)}px`;
    }

    /**
     * 操作弹窗不保留菜单层，也不把焦点还给其中已隐藏的按钮。
     */
    private closeMoreActions(): void {
        if (this.moreActions.matches(":popover-open")) this.moreActions.hidePopover();
    }

    /**
     * 关闭关于或数据确认后，焦点返回当前布局中可见的入口。
     */
    private focusMoreEntry(): void {
        (this.mobile.matches ? this.opener : this.moreButton).focus({ preventScroll: true });
    }
}
