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
 * 对象工具类
 * @author allurx
 */
export default class ObjectUtil {
    /**
     * 只赋值对象自身存在的属性
     * @param target - 目标对象
     * @param source - 源对象
     */
    public static assignOwnProperties<T extends object>(target: T, source: Partial<T>) {
        (Object.keys(target) as (keyof T)[]).forEach((key) => {
            const value = source[key];
            if (value !== undefined) target[key] = value;
        });
    }
}
