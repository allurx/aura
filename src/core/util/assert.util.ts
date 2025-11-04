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

/**
 * 断言工具类
 * @author allurx
 */
export default class AssertUtil {
    /**
     * 确保值非null/undefined,否则抛出错误
     * @param value 需要检查的值
     * @param message 错误提示,可选
     * @returns value
     */
    static assertExists<T>(value: T | null | undefined, message?: string): T {
        if (value === null || value === undefined) {
            throw new Error(message ?? "Value must not be null or undefined");
        }
        return value;
    }
}

export const assertExists = AssertUtil.assertExists.bind(AssertUtil);
