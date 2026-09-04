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
 * 提取类 T 的字段类型（排除方法）。
 *
 * `(...args: never[]) => unknown` 在某些边界情况下推断不够严格；不使用 `Function`，避免削弱类型安全。
 *
 * @see https://typescript-eslint.io/rules/no-unsafe-function-type/
 * @author allurx
 */
export type ClassFields<T> = {
    [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K];
};
