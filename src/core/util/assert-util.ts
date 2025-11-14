/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { NonEmptyArray } from "../type/common-type";

/**
 * 断言工具类
 * @author allurx
 */
export default class AssertUtil {
    private constructor() {
        throw new Error(`${AssertUtil.name} is a static class and cannot be instantiated.`);
    }
    /**
     * 确保值非null/undefined,否则抛出错误
     * @param value 需要检查的值
     * @param message 错误提示,可选
     * @returns value
     */
    public static assertExists<T>(value: T | null | undefined, message?: string): T {
        if (value === null || value === undefined) {
            throw new Error(message ?? "Value must not be null or undefined");
        }
        return value;
    }

    /**
     * 确保数组非空,否则抛出错误
     * @param value 需要检查的数组
     * @param message 错误提示,可选
     * @returns value
     */
    public static assertNonEmptyArray<T>(value: T[], message?: string): NonEmptyArray<T> {
        if (!Array.isArray(value) || value.length === 0) {
            throw new Error(message ?? "Value must be a non-empty array");
        }
        return value as NonEmptyArray<T>;
    }
}

export const assertExists = AssertUtil.assertExists.bind(AssertUtil);
export const assertNonEmptyArray = AssertUtil.assertNonEmptyArray.bind(AssertUtil);
