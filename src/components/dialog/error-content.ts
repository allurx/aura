/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import OperationError from "@/errors/operation-error";

/**
 * 将操作结果与可识别的原因按纯文本呈现，原始异常只在展开详细信息后显示。
 */
export function createErrorContent(error: unknown): { title: string; content: HTMLElement } {
    const operation = error instanceof OperationError ? error : undefined;
    const causes = collectCauses(operation ? operation.cause : error);
    const storageError = causes.find(
        (cause): cause is DOMException =>
            cause instanceof DOMException &&
            ["QuotaExceededError", "SecurityError", "NotReadableError"].includes(cause.name)
    );
    let title = "刚才的操作未完成";
    let reason: string | undefined;
    let recovery: string | undefined;
    switch (storageError?.name) {
        case "QuotaExceededError":
            title = "存储空间不足";
            reason = "浏览器可用于 Aura 的存储空间不足。";
            recovery = "请保留原始书籍文件，检查并释放设备或浏览器的可用存储空间。";
            break;
        case "SecurityError":
            title = "访问被浏览器阻止";
            reason = "浏览器阻止了这次访问请求。";
            recovery = "请检查浏览器的站点权限和隐私设置。";
            break;
        case "NotReadableError":
            title = "所选文件无法读取";
            reason = "浏览器无法读取所选文件。";
            recovery = "请确认文件仍在原位置且可以打开，再重新选择文件。";
            break;
    }

    const content = document.createElement("div");
    content.className = "error-content";
    const description = document.createElement("p");
    description.className = "error-description";
    description.textContent = operation?.details ?? reason ?? "Aura 遇到了意外问题，刚才的操作未能完成。";
    content.append(description);

    if (operation && reason) {
        const explanation = document.createElement("p");
        explanation.textContent = reason;
        content.append(explanation);
    }

    const nextStep = document.createElement("p");
    nextStep.className = "error-recovery";
    nextStep.textContent =
        [recovery, operation?.recovery].filter(Boolean).join("\n") ||
        "请关闭提示后重试。若仍无法完成，可展开详细信息，通过项目 GitHub 反馈问题。";
    content.append(nextStep);

    // 技术原因保留供用户核对；不展开堆栈，也不将异常内容解释为 HTML。
    const messages = causes.map((cause) =>
        cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
    );
    if (messages.length > 0) {
        const details = document.createElement("details");
        details.className = "error-diagnostics";
        const summary = document.createElement("summary");
        summary.textContent = "查看详细信息";
        const diagnostic = document.createElement("pre");
        diagnostic.textContent = messages.join("\n\n");
        details.append(summary, diagnostic);
        content.append(details);
    }

    return { title: operation?.message ?? title, content };
}

/**
 * 保留多阶段失败及嵌套原因；共享原因只展示一次，避免 AggregateError 的 cause 重复。
 */
function collectCauses(error: unknown): unknown[] {
    const causes: unknown[] = [];
    const pending = [error];
    const visited = new Set<unknown>();
    while (pending.length > 0) {
        const cause = pending.shift();
        if (cause === undefined || cause === null || visited.has(cause)) continue;
        visited.add(cause);
        causes.push(cause);
        if (cause instanceof Error && cause.cause !== undefined) pending.push(cause.cause);
        if (cause instanceof AggregateError) {
            const errors: unknown[] = cause.errors;
            pending.push(...errors);
        }
    }
    return causes;
}
