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
 * 为统一错误提示补充面向用户的操作摘要和明细，保留原始失败原因。
 * 文本按纯文本展示，不携带 DOM 或业务数据对象。
 * @author allurx
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
