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

import EventUtil from "../../../util/eventUtil.js";
import AssertUtil from "../../../util/assertUtil.js";

/**
 * 书架导航界面
 * @author allurx
 */
export default class NavUi {
    navElement: HTMLElement;

    // 书籍分类列表
    bookGenres: { id: number; name: string }[] = [
        { id: 1, name: "玄幻" },
        { id: 2, name: "奇幻" },
        { id: 3, name: "武侠" },
        { id: 4, name: "仙侠" },
        { id: 5, name: "科幻" },
        { id: 6, name: "末日" },
        { id: 7, name: "都市" },
        { id: 8, name: "职场" },
        { id: 9, name: "言情" },
        { id: 10, name: "军事" },
        { id: 11, name: "历史" },
        { id: 12, name: "游戏" },
        { id: 13, name: "体育" },
        { id: 14, name: "灵异" },
        { id: 15, name: "恐怖" },
        { id: 16, name: "魔幻" },
    ];

    constructor() {
        this.navElement = AssertUtil.assertExist(document.querySelector("nav"));
    }

    /**
     * 渲染导航栏
     * @returns 返回当前实例
     */
    renderNav() {
        this.bookGenres.forEach((bookGenre) => {
            const button = document.createElement("button");
            button.dataset["id"] = bookGenre.id.toString();
            button.textContent = bookGenre.name;
            this.navElement.appendChild(button);
        });
        return this;
    }

    /**
     * 切换导航栏可见性
     * @returns 返回当前实例
     */
    toggleVisibility() {
        this.navElement.classList.toggle("hidden");
        return this;
    }

    /**
     * 高亮显示当前选中的导航栏项目
     * @param  navItemElement - 导航栏项目元素
     * @returns 返回当前实例
     */
    highlightActiveNavItem(navItemElement: HTMLElement) {
        this.navElement.querySelector("button.active")?.classList.remove("active");
        navItemElement.classList.add("active");
        return this;
    }

    /**
     * 触发导航栏点击事件
     * @param genreId - 书籍分类id
     * @returns 返回当前实例
     */
    dispatchNavItemClick(genreId: number) {
        const navItem = this.navElement.querySelector(`button[data-id="${String(genreId)}"]`);
        navItem?.dispatchEvent(new Event("click", { bubbles: true }));
        return this;
    }

    /**
     * 绑定导航栏点击事件
     * @param  handler - 处理函数
     * @returns 返回当前实例
     */
    bindNavItemClick(handler:  (genreId: number) => Promise<void>) {
        EventUtil.delegate(this.navElement, "button", "click", async (_, target) => {
            this.highlightActiveNavItem(target);
            await handler(Number(target.dataset["id"]));
        });
        return this;
    }
}
