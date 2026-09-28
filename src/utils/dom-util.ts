/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 将仅包含一个根元素的可信 HTML 模板转换为节点。
 * 调用方应按模板指定根元素类型；外部文本必须使用文本节点，不能作为模板传入。
 */
export function createElementFromHtml<T extends HTMLElement = HTMLElement>(html: string): T {
    const template = document.createElement("template");
    template.innerHTML = html.trim();

    if (template.content.children.length === 1) {
        return template.content.firstElementChild as T;
    }
    throw new Error("HTML string must contain exactly one root element.");
}
