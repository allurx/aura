/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

// 分类按展示顺序定义；ID 表达分类语义，修改显示名称或顺序时保持不变。
export const CATEGORIES = [
    { id: "collection", name: "收藏" },
    { id: "literature", name: "文学" },
    { id: "fiction", name: "小说" },
    { id: "science-fiction", name: "科幻" },
    { id: "fantasy-xuanhuan", name: "奇幻玄幻" },
    { id: "wuxia-xianxia", name: "武侠仙侠" },
    { id: "mystery-suspense", name: "悬疑推理" },
    { id: "romance", name: "言情" },
    { id: "history", name: "历史" },
    { id: "biography-narrative-nonfiction", name: "传记纪实" },
    { id: "philosophy-religion", name: "哲学宗教" },
    { id: "psychology", name: "心理" },
    { id: "society-culture", name: "社会文化" },
    { id: "politics-law", name: "政治法律" },
    { id: "economics-finance", name: "经济金融" },
    { id: "business-management", name: "商业管理" },
    { id: "popular-science", name: "科普" },
    { id: "computing", name: "计算机" },
    { id: "engineering-technology", name: "工程技术" },
    { id: "medicine-health", name: "医学健康" },
    { id: "arts-design", name: "艺术设计" },
    { id: "lifestyle-leisure", name: "生活休闲" },
    { id: "study-materials", name: "学习资料" },
    { id: "other", name: "其他" },
] as const;

/**
 * 固定目录中的有效分类标识。
 */
export type CategoryId = (typeof CATEGORIES)[number]["id"];

// 全部书籍中的导入使用固定目标，不随分类展示顺序变化。
export const DEFAULT_CATEGORY_ID: CategoryId = "collection";

/**
 * 从统一目录查找分类，供页面展示和业务写入校验使用。
 */
export function getCategory(id: string) {
    return CATEGORIES.find((category) => category.id === id);
}
