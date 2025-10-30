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
 * 阅读器主题
 * @author allurx
 */
export default class ReaderTheme extends BaseModel {
  name!: string;
  value!: string;
  fontColor!: string;
  readerBackgroundColor!: string;
  backgroundColor!: string;

  /**
   * @param  data - 初始化阅读器主题所需的所有字段
   */
  constructor(data: Partial<ReaderTheme>) {
    super();
    Object.assign(this, data);
  }
}
