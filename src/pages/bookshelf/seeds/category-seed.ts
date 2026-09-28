/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type Category from "@/domain/category/category";

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

/**
 * 创建预置书籍分类。
 * @returns 按默认展示顺序排列的分类
 */
export function createCategorySeeds(): Category[] {
    return categoryNames.map((name, index) => ({
        id: crypto.randomUUID(),
        name,
        order: index + 1,
    }));
}
