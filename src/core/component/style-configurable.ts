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

import { ConfigurableStyleProperty } from "./constant/configurable.style.property";

/**
 * 可配置样式接口
 * @author allurx
 */
export default interface StyleConfigurable {
    /**
     *  可配置样式集合
     */
    readonly configurableStyleProperties: Set<ConfigurableStyleProperty>;

    /**
     * 应用可配置样式
     * @param style - 可配置样式
     */
    applyStyle(style: Partial<Record<ConfigurableStyleProperty, string>>): this;

    /**
     * 重置可配置样式
     */
    resetStyle(): this;
}
