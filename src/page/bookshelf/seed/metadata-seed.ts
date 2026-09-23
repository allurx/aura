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

import { APP_NAME } from "@/app-info";
import Metadata from "@/domain/metadata/metadata";
import { HANDBOOK_VERSION } from "./handbook-seed";

/**
 * 创建应用元数据种子。
 * @param handbookBookId - 内置手册对应的书籍 ID
 * @returns 应用元数据
 */
export function createMetadataSeed(handbookBookId: string): Metadata {
    const nowMs = Date.now();
    return new Metadata({
        id: crypto.randomUUID(),
        appName: APP_NAME,
        handbookBookId,
        handbookVersion: HANDBOOK_VERSION,
        createdTime: nowMs,
        updatedTime: nowMs,
    });
}
