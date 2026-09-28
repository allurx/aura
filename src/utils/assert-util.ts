/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 确保必需值不是 null 或 undefined，失败时保留调用方提供的上下文。
 */
export function assertExists<T>(value: T | null | undefined, message?: string): T {
    if (value === null || value === undefined) {
        throw new Error(message ?? "Value must not be null or undefined");
    }
    return value;
}
