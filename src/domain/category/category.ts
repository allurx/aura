/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

// 分类按展示顺序定义；ID 表达分类语义，修改显示名称或顺序时保持不变。
export const CATEGORIES = [
    // 收纳入口与小说题材。
    { id: "collection", name: "收藏" },
    { id: "fiction", name: "小说" },
    { id: "romance", name: "言情" },
    { id: "mystery-suspense", name: "悬疑推理" },
    { id: "science-fiction", name: "科幻" },
    { id: "fantasy", name: "奇幻" },
    { id: "wuxia-xianxia", name: "武侠仙侠" },

    // 文学、人文社科与经济商业。
    { id: "literature", name: "文学" },
    { id: "history", name: "历史" },
    { id: "biography-narrative-nonfiction", name: "传记纪实" },
    { id: "philosophy-religion", name: "哲学宗教" },
    { id: "society-culture", name: "社会文化" },
    { id: "politics-law", name: "政法" },
    { id: "economics-finance", name: "财经" },
    { id: "business-management", name: "商业管理" },

    // 科学技术、身心生活与资料。
    { id: "popular-science", name: "科普" },
    { id: "computing", name: "计算机" },
    { id: "engineering-technology", name: "工程技术" },
    { id: "psychology", name: "心理" },
    { id: "medicine-health", name: "医学健康" },
    { id: "lifestyle-leisure", name: "生活" },
    { id: "arts-design", name: "艺术设计" },
    { id: "study-materials", name: "学习资料" },
    { id: "other", name: "其他" },
] as const;

/**
 * 预设分类的持久化标识。
 */
export type CategoryId = (typeof CATEGORIES)[number]["id"];

// 全部书籍中的导入使用固定目标，不随分类展示顺序变化。
export const DEFAULT_CATEGORY_ID: CategoryId = "collection";

/**
 * 查找预设分类，未知标识返回 undefined，供展示和写入校验使用。
 */
export function getCategory(id: string) {
    return CATEGORIES.find((category) => category.id === id);
}
