/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { deleteDatabase } from "@/database/database";
import OperationError from "@/errors/operation-error";

/**
 * 删除 Aura 数据库，再清空当前站点的 localStorage 和当前标签页的 sessionStorage。
 * 调用前须确认重置；全部成功后由调用方刷新页面。
 */
export async function resetData(onBlocked: () => void): Promise<void> {
    await deleteDatabase(onBlocked);

    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (error) {
        throw new OperationError(
            "数据库已删除，但其他 Aura 数据未全部清除。",
            "请确认浏览器允许访问本地存储后重试重置。",
            error
        );
    }
}
