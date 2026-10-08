/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 为统一错误提示补充具体标题、操作结果和恢复建议，保留原始失败原因。
 * 文本按纯文本展示，不携带 DOM 或业务数据对象。
 */
export default class OperationError extends Error {
    /**
     * @param message - 直接说明未完成事项的简短标题
     * @param details - 已完成结果或当前影响，不重复标题
     * @param cause - 原始异常，供通用提示判断及错误追踪
     * @param recovery - 当前操作特有的下一步；不提供时按已知原因给出建议
     */
    public constructor(
        message: string,
        public readonly details: string,
        cause: unknown,
        public readonly recovery?: string
    ) {
        super(message, { cause });
        this.name = "OperationError";
    }
}
