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
    private constructor() {
        throw new Error(`${ObjectUtil.name} is a static class and cannot be instantiated.`);
    }
    /**
     * 赋值对象自身属性
     * @param target - 目标对象
     * @param source - 源对象
     */
    public static assignOwnProperties<T extends object>(target: T, source: Partial<T>) {
        (Object.keys(target) as (keyof T)[]).forEach((key) => {
            const value = source[key];
            if (value !== undefined) target[key] = value;
        });
        return target;
    }

    public static isNull<T>(value: T | null): boolean {
        return value === null;
    }

    public static isNotNull<T>(value: T | null): boolean {
        return value !== null;
    }

    public static isUndefined<T>(value: T | undefined): boolean {
        return value === undefined;
    }

    public static isNotUndefined<T>(value: T | undefined): boolean {
        return value !== undefined;
    }

    public static isNullOrUndefined<T>(value: T | null | undefined): boolean {
        return value === null || value === undefined;
    }

    public static exists<T>(value: T | null | undefined): boolean {
        return value !== null && value !== undefined;
    }
}

export const assignOwnProperties = ObjectUtil.assignOwnProperties.bind(ObjectUtil);
export const isNull = ObjectUtil.isNull.bind(ObjectUtil);
export const isUndefined = ObjectUtil.isUndefined.bind(ObjectUtil);
export const isNullOrUndefined = ObjectUtil.isNullOrUndefined.bind(ObjectUtil);
