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
import ObjectUtil from "@/util/object-util";

import { ClassFields } from "@/type/common-type";

/**
 * 基础模型类
 * @author allurx
 */
export default abstract class BaseModel {
    // 模型唯一标识符(uuid)
    public id!: string;
    public createdTime!: number;
    public updatedTime!: number;

    /**
     * 更新模型属性
     * @param data - 包含要更新的属性的对象
     * @return {this} 返回更新后的模型实例
     */
    update(data: Partial<ClassFields<this>>): this {
        ObjectUtil.assignOwnProperties(this, data);
        return this;
    }
}
