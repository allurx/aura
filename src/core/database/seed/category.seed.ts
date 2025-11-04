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
import Category from "../../../domain/category/category.model";

/**
 * 分类数据种子
 * @author allurx
 */
export default class CategorySeed {
    public static readonly categories = [
        new Category({ id: crypto.randomUUID(), name: "玄幻" }),
        new Category({ id: crypto.randomUUID(), name: "奇幻" }),
        new Category({ id: crypto.randomUUID(), name: "武侠" }),
        new Category({ id: crypto.randomUUID(), name: "仙侠" }),
        new Category({ id: crypto.randomUUID(), name: "科幻" }),
        new Category({ id: crypto.randomUUID(), name: "末日" }),
        new Category({ id: crypto.randomUUID(), name: "都市" }),
        new Category({ id: crypto.randomUUID(), name: "职场" }),
        new Category({ id: crypto.randomUUID(), name: "言情" }),
        new Category({ id: crypto.randomUUID(), name: "军事" }),
        new Category({ id: crypto.randomUUID(), name: "历史" }),
        new Category({ id: crypto.randomUUID(), name: "游戏" }),
        new Category({ id: crypto.randomUUID(), name: "体育" }),
        new Category({ id: crypto.randomUUID(), name: "灵异" }),
        new Category({ id: crypto.randomUUID(), name: "恐怖" }),
        new Category({ id: crypto.randomUUID(), name: "魔幻" }),
    ];
}
