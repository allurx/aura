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
 * 常用类型定义
 * @author allurx
 */

// 非空数组类型
export type NonEmptyArray<T> = [T, ...T[]];

/**
 * ClassFields<T>
 * 提取类T的字段类型(排除方法)
 * 注意(...args: unknown[]) => unknown在某些边界情况下推断不够严格。
 * 不使用Function类型,避免ESLint报警
 * @link https://typescript-eslint.io/rules/no-unsafe-function-type/
 */
export type ClassFields<T> = {
    [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K];
};
