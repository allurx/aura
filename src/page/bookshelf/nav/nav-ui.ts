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

import Category from "../../../domain/category/category";
import EventUtil from "../../../util/event-util";
import { assertExists } from "../../../util/assert-util";

/**
 * 书架导航界面
 * @author allurx
 */
export default class NavUi {
    public readonly navElement: HTMLElement;

    public constructor() {
        this.navElement = assertExists(document.querySelector("nav"));
    }

    /**
     * 渲染导航栏
     * @returns 返回当前实例
     */
    public renderNav(categories: Category[]) {
        categories
            .sort((a, b) => a.order - b.order)
            .forEach((category) => {
                const button = document.createElement("button");
                button.dataset["id"] = category.id;
                button.textContent = category.name;
                this.navElement.appendChild(button);
            });
        return this;
    }

    /**
     * 切换导航栏可见性
     * @returns 返回当前实例
     */
    public toggleVisibility() {
        this.navElement.classList.toggle("flag-visible");
        return this;
    }

    /**
     * 高亮显示当前选中的导航栏项目
     * @param  navItemElement - 导航栏项目元素
     * @returns 返回当前实例
     */
    public highlightActiveNavItem(navItemElement: HTMLElement) {
        this.navElement.querySelector("button.active")?.classList.remove("active");
        navItemElement.classList.add("active");
        return this;
    }

    /**
     * 点击导航栏项目
     * @param categoryId - 书籍分类id
     * @returns 返回当前实例
     */
    public clickNavItem(categoryId: string) {
        const navItem = this.navElement.querySelector(`button[data-id="${categoryId}"]`);
        navItem?.dispatchEvent(new Event("click", { bubbles: true }));
        return this;
    }

    /**
     * 绑定导航栏点击事件
     * @param  handler - 处理函数
     * @returns 返回当前实例
     */
    public delegateNavItemClick(handler: (categoryId: string) => Promise<void>) {
        EventUtil.delegate(this.navElement, "button", "click", async (_, target) => {
            this.highlightActiveNavItem(target);
            await handler(assertExists(target.dataset["id"]));
        });
        return this;
    }
}
