/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind } from "@/utils/event-util";
import { assertExists } from "@/utils/assert-util";
import Ui from "@/components/ui";

/**
 * 分类标题、搜索和导入工具栏。
 */
export default class HeaderUi extends Ui {
    private readonly search = assertExists(this.root.querySelector<HTMLInputElement>("#book-search"));
    private readonly input = assertExists(this.root.querySelector<HTMLInputElement>("#book-input"));
    private readonly importButton = assertExists(this.root.querySelector<HTMLButtonElement>("#import-books"));
    private renderedQuery = "";

    /**
     * 显示当前分类与筛选后的数量。
     */
    public render(category: string, count: number, query: string): void {
        assertExists(this.root.querySelector("#category-title")).textContent = category;
        assertExists(this.root.querySelector("#book-count")).textContent = `${String(count)} 本`;
        this.renderedQuery = query;
        this.search.value = query;
    }

    /**
     * 绑定搜索与文件选择器，选择结束后允许再次选择同一文件。
     */
    public bindEvents(
        onSearch: (query: string) => void,
        onImport: (files: File[]) => Promise<void>,
        onAppearance: (opener: HTMLElement) => void,
        signal: AbortSignal
    ): void {
        // 保留外观入口节点，面板关闭后可将焦点归还给原按钮。
        bind(
            assertExists(this.root.querySelector<HTMLButtonElement>("#toggle-setting-panel")),
            "click",
            (_, button) => {
                onAppearance(button);
            },
            { signal }
        );

        // 输入法完成后才筛选，避免候选阶段反复重建列表和播报数量。
        const updateSearch = (): void => {
            if (this.search.value !== this.renderedQuery) onSearch(this.search.value);
        };
        bind(this.search, "compositionend", updateSearch, { signal });

        // Escape 清空查询，但输入法取消候选时保留搜索框内容。
        bind(
            this.search,
            "keydown",
            (event) => {
                if (event instanceof KeyboardEvent && event.key === "Escape" && !event.isComposing) {
                    this.search.value = "";
                    updateSearch();
                }
            },
            { signal }
        );

        bind(
            this.search,
            "input",
            (event) => {
                if (!(event instanceof InputEvent) || !event.isComposing) updateSearch();
            },
            { signal }
        );

        // 可见按钮打开原生文件选择器，文件列表由其 change 事件提交。
        bind(
            this.importButton,
            "click",
            () => {
                this.input.click();
            },
            { signal }
        );

        bind(
            this.input,
            "change",
            async () => {
                try {
                    await onImport(Array.from(this.input.files ?? []));
                } finally {
                    // 成功或失败都清空选择，下一次仍能导入同一文件。
                    this.input.value = "";
                }
            },
            { signal }
        );
    }
}
