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

import BaseModel from "./baseModel.js";

/**
 * 章节
 * @author allurx
 */
export default class Chapter extends BaseModel {
  fileId!: string;
  index!: number;
  title!: string;
  lines!: string[];

  // 本章节在整本书的起始行号
  startLineNumber!: number;

  // 本章节在整本书的结束行号
  endLineNumber!: number;

  /**
   * @param  data - 初始化章节所需的所有字段
   */
  constructor(data: Partial<Chapter>) {
    super();
    Object.assign(this, data);
  }

  /**
   * @return {string} 整个章节内容
   */
  content(): string {
    return this.lines.join("\n");
  }
}
