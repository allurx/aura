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
 * 基础模型类
 * @author allurx
 */
export default class BaseModel {

    /** @type {string} */
    id;

    /**  
     * 更新模型属性
     * @param {Object} data - 要更新的属性对象
     * @returns {this} 当前实例
     */
    update(data = {}) {
        Object.assign(this, data);
        return this;
    }
}