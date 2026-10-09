/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 导入与呈现共用的结构白名单，不包含可执行内容、样式或外部资源入口。
 */
export const EPUB_ELEMENT_TAGS = [
    "a",
    "article",
    "aside",
    "b",
    "blockquote",
    "br",
    "caption",
    "code",
    "dd",
    "del",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "ins",
    "li",
    "mark",
    "ol",
    "p",
    "pre",
    "rp",
    "rt",
    "ruby",
    "s",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
] as const;

export type EpubElementTag = (typeof EPUB_ELEMENT_TAGS)[number];

/**
 * 导入时已经验证、由阅读器作为本地图片呈现的资源。
 */
export interface EpubResource {
    path: string;
    blob: Blob;
}

/**
 * 书内导航目标；path 与 section.path 共用解码后的归档路径，fragment 不包含 #。
 */
export interface EpubLinkTarget {
    path: string;
    fragment?: string;
}

/**
 * 安全的文本节点，不作为 HTML 解析。
 */
export interface EpubTextNode {
    type: "text";
    text: string;
}

/**
 * 只保存允许的结构和有限语义属性，不保存样式、事件或外部链接。
 */
export interface EpubElementNode {
    type: "element";
    tag: EpubElementTag;
    children: EpubNode[];
    id?: string;
    href?: EpubLinkTarget;
    colSpan?: number;
    rowSpan?: number;
    start?: number;
    value?: number;
    reversed?: boolean;
    dir?: "ltr" | "rtl" | "auto";
}

/**
 * 引用已验证的本地资源；SVG 与位图都只能通过 img 加载。
 */
export interface EpubImageNode {
    type: "image";
    path: string;
    alt: string;
    id?: string;
}

export type EpubNode = EpubTextNode | EpubElementNode | EpubImageNode;
