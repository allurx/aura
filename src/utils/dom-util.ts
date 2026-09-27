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
 * DOM utility class
 * @author allurx
 */
export default abstract class DomUtil {
    /**
     * 将仅包含一个根元素的可信 HTML 模板转换为节点。
     * 本方法不清洗 HTML，文件名和正文等外部数据应通过文本节点写入。
     */
    public static createElementFromHtml(html: string): HTMLElement {
        const template = document.createElement("template");
        template.innerHTML = html.trim();

        if (template.content.children.length === 1) {
            return template.content.firstElementChild as HTMLElement;
        }
        throw new Error("HTML string must contain exactly one root element.");
    }
}
