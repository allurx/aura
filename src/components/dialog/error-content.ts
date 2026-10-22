/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import OperationError from "@/errors/operation-error";

/**
 * 将操作结果与恢复建议按纯文本分组呈现，原始异常只在展开技术详情后显示。
 */
export function createErrorContent(error: unknown): { title: string; content: HTMLElement } {
    const operation = error instanceof OperationError ? error : undefined;
    const causes = collectCauses(operation ? operation.cause : error);
    const knownCause = causes.find(
        (cause): cause is DOMException =>
            cause instanceof DOMException &&
            ["QuotaExceededError", "SecurityError", "NotReadableError"].includes(cause.name)
    );
    let title = "操作遇到问题";
    let reason: string | undefined;
    let recovery: string | undefined;
    switch (knownCause?.name) {
        case "QuotaExceededError":
            title = "存储空间不足";
            reason = "浏览器可用于 Aura 的存储空间不足。";
            recovery = "请保留原文件，检查设备空间和浏览器存储限制。";
            break;
        case "SecurityError":
            title = "访问被浏览器阻止";
            reason = "浏览器阻止了这次访问。";
            recovery = "请检查站点权限和浏览器隐私设置。";
            break;
        case "NotReadableError":
            title = "所选文件无法读取";
            reason = "浏览器无法读取所选文件。";
            recovery = "请确认文件可以打开，再重新选择。";
            break;
    }

    const content = document.createElement("div");
    content.className = "error-content";
    const result = document.createElement("div");
    result.className = "error-result";
    const description = document.createElement("p");
    description.className = "error-description";
    description.textContent = operation?.details ?? reason ?? "发生意外错误，操作结果尚未确认。";
    result.append(description);

    if (operation && reason) {
        // 批量结果保留逐文件换行，原因不接到最后一个文件名后；普通结果与原因自然连读。
        if (operation.details.includes("\n")) {
            const explanation = document.createElement("p");
            explanation.textContent = reason;
            result.append(explanation);
        } else {
            description.append(reason);
        }
    }
    content.append(result);

    // 步骤来自明确的恢复契约，不根据标点猜测句子的操作顺序。
    const steps: string[] = [];
    if (recovery) steps.push(recovery);
    if (typeof operation?.recovery === "string") steps.push(operation.recovery);
    else if (operation?.recovery) steps.push(...operation.recovery);
    if (steps.length === 0) steps.push("请先确认操作是否生效，再决定是否重试。问题持续时可向项目 GitHub 反馈。");

    const guidance = document.createElement("div");
    guidance.className = "error-guidance";
    const guidanceTitle = document.createElement("p");
    guidanceTitle.className = "error-guidance-title";
    guidanceTitle.textContent = "建议操作";
    const nextStep = document.createElement(steps.length > 1 ? "ol" : "p");
    nextStep.className = "error-recovery";
    if (steps.length > 1) {
        nextStep.classList.add("recovery-steps");
        for (const step of steps) {
            const item = document.createElement("li");
            item.textContent = step;
            nextStep.append(item);
        }
    } else {
        nextStep.textContent = steps[0] ?? "";
    }
    guidance.append(guidanceTitle, nextStep);
    content.append(guidance);

    // 技术原因保留供用户核对；不展开堆栈，也不将异常内容解释为 HTML。
    const messages = causes.map((cause) =>
        cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)
    );
    if (messages.length > 0) {
        const details = document.createElement("details");
        details.className = "error-diagnostics";
        const summary = document.createElement("summary");
        summary.textContent = "技术详情";
        const diagnostic = document.createElement("pre");
        diagnostic.tabIndex = 0;
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
