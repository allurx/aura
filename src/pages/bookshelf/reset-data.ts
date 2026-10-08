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
    try {
        await deleteDatabase(onBlocked);
    } catch (error) {
        throw new OperationError(
            "数据重置未完成",
            "Aura 未能删除本地书籍数据库，后续清理尚未执行。",
            error,
            "请关闭其他 Aura 标签页或窗口，再尝试重置。"
        );
    }

    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (error) {
        throw new OperationError(
            "数据重置只完成了一部分",
            "书籍和阅读进度已删除，外观或会话数据尚未全部清除。",
            error,
            "请确认浏览器允许访问本地存储，再执行一次重置。"
        );
    }
}
