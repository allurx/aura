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

import { ClassFields } from "../../core/type/common.type";
import BaseModel from "../base.model";
import ObjectUtil from "../../core/util/object.util";

/**
 * 书籍
 * @author allurx
 */
export default class Book extends BaseModel {
    public readonly fileId!: string;
    public readonly fileName!: string;
    public readonly categoryId!: string;

    public constructor(data: ClassFields<Book>) {
        super();
        ObjectUtil.assignOwnProperties<Book>(this, data);
    }

    /**
     * @returns 书籍元素的html模板
     */
    public template(): string {
        return `
            <div data-id="${this.id}" class="book">
                <div class="book-header">
                    <span class="book-delete-btn">✖</span>
                </div>
                <div class="book-body">
                    <span class="book-title">${this.extractTitle(this.fileName)}</span>
                </div>
                <div class="book-footer"></div>
            </div>
            `;
    }

    private extractTitle(filename: string): string {
        return filename.substring(0, filename.lastIndexOf("."));
    }
}
