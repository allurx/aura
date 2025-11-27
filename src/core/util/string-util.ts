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
 * 字符串工具类
 * @author allurx
 */
export default class StringUtil {
    private constructor() {
        throw new Error(`${StringUtil.name} is a static class and cannot be instantiated.`);
    }

    public static isEmpty(value: string): boolean {
        return value.length === 0;
    }

    public static isNotEmpty(value: string): boolean {
        return value.length > 0;
    }
}
