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

import Category from "@/domain/category/category";

const categoryNames = [
    "收藏",
    "玄幻",
    "科幻",
    "奇幻",
    "末日",
    "都市",
    "职场",
    "言情",
    "武侠",
    "仙侠",
    "军事",
    "历史",
    "游戏",
    "体育",
    "灵异",
    "恐怖",
    "魔幻",
] as const;

export function createCategorySeeds(): Category[] {
    const nowMs = Date.now();
    return categoryNames.map(
        (name, index) =>
            new Category({
                id: crypto.randomUUID(),
                name,
                order: index + 1,
                createdTime: nowMs,
                updatedTime: nowMs,
            })
    );
}
