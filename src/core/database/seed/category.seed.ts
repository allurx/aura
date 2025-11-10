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
import Category from "../../../domain/category/category.model";

/**
 * 分类数据种子
 * @author allurx
 */
export default class CategorySeed {
    private static readonly nextOrder: Generator<number, never, never> = (function* (current = 1) {
        for (;;) yield current++;
    })();

    public static readonly categories = [
        new Category({
            id: crypto.randomUUID(),
            name: "收藏",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "玄幻",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "科幻",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "奇幻",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "末日",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "都市",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "职场",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "言情",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "武侠",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "仙侠",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "军事",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "历史",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "游戏",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "体育",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "灵异",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "恐怖",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
        new Category({
            id: crypto.randomUUID(),
            name: "魔幻",
            order: this.nextOrder.next().value,
            createdTime: Date.now(),
            updatedTime: Date.now(),
        }),
    ];
}
