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
     * Convert HTML string to typed DOM element.
     */
    public static createElementFromHTML(html: string): HTMLElement {
        const template = document.createElement("template");
        template.innerHTML = html.trim();

        if (template.content.children.length === 1) {
            return template.content.firstElementChild as HTMLElement;
        }
        throw new Error("HTML string must contain exactly one root element.");
    }
}
