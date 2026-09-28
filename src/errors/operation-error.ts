/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 为统一错误提示补充面向用户的操作摘要和明细，保留原始失败原因。
 * 文本按纯文本展示，不携带 DOM 或业务数据对象。
 */
export default class OperationError extends Error {
    /**
     * @param message - 操作完成情况的可读摘要
     * @param details - 需要用户核对的详细结果
     * @param cause - 原始异常，供通用提示判断及错误追踪
     */
    public constructor(
        message: string,
        public readonly details: string,
        cause: unknown
    ) {
        super(message, { cause });
        this.name = "OperationError";
    }
}
