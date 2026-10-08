/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { EpubArchive, EpubImportError } from "./epub-archive";

export { EpubImportError } from "./epub-archive";

/**
 * 导入时已经验证、由阅读器作为本地图片呈现的资源。
 */
export interface EpubResource {
    path: string;
    blob: Blob;
}

const allowedTags = [
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

export type EpubElementTag = (typeof allowedTags)[number];

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

/**
 * 一个阅读顺序文档，保持内部段落和锚点结构。
 */
export interface EpubSection {
    title: string;
    path: string;
    anchors: string[];
    // 被前向合并的空片段锚点指向本节开头，不创建额外正文块。
    startAnchors?: string[];
    blocks: EpubNode[];
}

/**
 * EPUB 2/3 的可重排正文与实际引用的图片；不包含原书脚本或样式。
 */
export interface EpubPublication {
    sections: EpubSection[];
    resources: EpubResource[];
}

/**
 * OPF manifest 中解析过的本地资源信息。
 */
interface ManifestItem {
    id: string;
    path: string;
    mediaType: string;
    properties: string[];
}

/**
 * 导航可以指向同一 XHTML 内的不同章节，不能只按文件路径去重。
 */
interface NavigationEntry {
    target: EpubLinkTarget;
    title: string;
}

/**
 * 单次导入共享的图片、链接与复杂度预算。
 */
interface ParseContext {
    archive: EpubArchive;
    manifest: Map<string, ManifestItem>;
    resources: Map<string, EpubResource>;
    links: EpubLinkTarget[];
    nodeCount: number;
    inlineImageCount: number;
}

const MAX_XML_BYTES = 16 * 1024 * 1024;
const MAX_CONTENT_NODES = 500_000;
const MAX_ELEMENT_DEPTH = 200;
const VIRTUAL_ORIGIN = "https://aura-epub.invalid";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const elementTags = new Set<string>(allowedTags);
const discardedTags = new Set(["script", "style", "link", "meta", "head", "template", "noscript", "source"]);
const unsupportedTags = new Set([
    "audio",
    "video",
    "iframe",
    "canvas",
    "math",
    "embed",
    "form",
    "button",
    "input",
    "select",
    "textarea",
]);
const imageMediaTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/svg+xml"]);
const fontObfuscationAlgorithms = new Set(["http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC"]);

/**
 * 读取 EPUB 2/3；按 spine 排序，追加正文引用的补充章节，全部解析通过后交给调用方持久化。
 * 固定版式、DRM、无法呈现的正文或损坏资源明确拒绝，不返回部分书籍。
 */
export async function parseEpub(file: File): Promise<EpubPublication> {
    const archive = await EpubArchive.open(file);
    const mimetype = new TextDecoder().decode(await archive.read("mimetype", 128));
    if (mimetype.trim() !== "application/epub+zip") throw new EpubImportError("文件没有有效的 EPUB 类型声明。");

    const container = await readXml(archive, "META-INF/container.xml");
    const rootfile = descendants(container, "rootfile").find(
        (element) => element.getAttribute("media-type") === "application/oebps-package+xml"
    );
    const packagePath = resolveRequired(rootfile?.getAttribute("full-path") ?? "", "", "EPUB 缺少内容包入口。").path;
    const packageDocument = await readXml(archive, packagePath);
    const packageElement = packageDocument.documentElement;
    if (packageElement.localName !== "package" || !/^[23](?:\.|$)/u.test(packageElement.getAttribute("version") ?? ""))
        throw new EpubImportError("只支持 EPUB 2 和 EPUB 3 内容包。");
    rejectFixedLayout(packageDocument);

    const manifestElement = descendants(packageDocument, "manifest")[0];
    const spine = descendants(packageDocument, "spine")[0];
    if (!manifestElement || !spine) throw new EpubImportError("EPUB 缺少资源清单或阅读顺序。");
    const byId = new Map<string, ManifestItem>();
    const manifest = new Map<string, ManifestItem>();
    for (const element of Array.from(manifestElement.children)) {
        if (element.localName !== "item") continue;
        const id = element.getAttribute("id");
        const href = element.getAttribute("href");
        if (!id || !href) throw new EpubImportError("EPUB 资源清单存在缺失的标识或路径。");
        const target = resolveReference(href, packagePath);
        // 外部条目不请求；若正文实际依赖它，会在对应入口明确拒绝。
        if (!target) continue;
        const item: ManifestItem = {
            id,
            path: target.path,
            mediaType: element.getAttribute("media-type") ?? "",
            properties: tokens(element.getAttribute("properties")),
        };
        if (byId.has(id) || manifest.has(item.path)) throw new EpubImportError("EPUB 资源清单存在重复的标识或路径。");
        byId.set(id, item);
        manifest.set(item.path, item);
    }
    await rejectEncryption(archive, manifest);

    const readingOrder: ManifestItem[] = [];
    for (const reference of Array.from(spine.children)) {
        if (reference.localName !== "itemref") continue;
        if (tokens(reference.getAttribute("properties")).includes("rendition:layout-pre-paginated"))
            throw new EpubImportError("暂不支持固定版式 EPUB，请使用可重排版式的版本。");
        const item = byId.get(reference.getAttribute("idref") ?? "");
        if (!item) throw new EpubImportError("EPUB 阅读顺序引用了缺失或外部的正文。");
        assertContentType(item);
        if (!readingOrder.some((existing) => existing.path === item.path)) readingOrder.push(item);
    }
    if (readingOrder.length === 0) throw new EpubImportError("EPUB 没有可阅读的正文。");

    const navigation = await readNavigation(archive, manifest, byId.get(spine.getAttribute("toc") ?? ""));
    const context: ParseContext = {
        archive,
        manifest,
        resources: new Map(),
        links: [],
        nodeCount: 0,
        inlineImageCount: 0,
    };
    const sections: EpubSection[] = [];
    const scheduled = new Set(readingOrder.map((item) => item.path));
    let consumedLinks = 0;
    for (const item of readingOrder) {
        const document = await readXml(archive, item.path);
        const body = descendants(document, "body")[0];
        if (!body) throw new EpubImportError(`EPUB 正文缺少 body：${item.path}`);
        sections.push(...(await parseSections(document, body, item.path, navigation, context, sections.length)));

        // 一些书将脚注或附录放在 spine 外；被书内链接使用时才追加，不悄悄丢掉目标。
        for (; consumedLinks < context.links.length; consumedLinks++) {
            const target = context.links[consumedLinks];
            if (!target || scheduled.has(target.path)) continue;
            const linkedItem = manifest.get(target.path);
            if (!linkedItem) throw new EpubImportError(`EPUB 书内链接指向缺失的正文：${target.path}`);
            assertContentType(linkedItem);
            scheduled.add(target.path);
            readingOrder.push(linkedItem);
        }
    }
    if (!sections.some((section) => hasReadableContent(section.blocks)))
        throw new EpubImportError("EPUB 没有可阅读的文字或图片。");
    return { sections, resources: [...context.resources.values()] };
}

/**
 * 按 localName 读取 XML，兼容默认命名空间与显式前缀。
 */
function descendants(root: Document | Element, name: string): Element[] {
    return Array.from(root.getElementsByTagNameNS("*", name));
}

/**
 * 空白分隔的 OPF 属性值。
 */
function tokens(value: string | null): string[] {
    return value?.trim().split(/\s+/u).filter(Boolean) ?? [];
}

/**
 * 只解析书内 URI；解码路径后再次核对，避免编码的路径段绕过目录边界。
 */
function resolveReference(reference: string, basePath: string): EpubLinkTarget | undefined {
    if (/^[a-z][a-z\d+.-]*:/iu.test(reference) || reference.startsWith("//")) return undefined;
    try {
        const base = new URL(basePath.split("/").map(encodeURIComponent).join("/"), `${VIRTUAL_ORIGIN}/`);
        const url = new URL(reference, base);
        if (url.origin !== VIRTUAL_ORIGIN || url.search) return undefined;
        const path = decodeURIComponent(url.pathname.slice(1));
        if (
            !path ||
            path.includes("\\") ||
            Array.from(path).some((character) => character.charCodeAt(0) < 32) ||
            path.split("/").some((part) => part === "." || part === "..")
        )
            throw new EpubImportError("EPUB 包含无效的资源路径。");
        const fragment = decodeURIComponent(url.hash.slice(1));
        return { path, ...(fragment ? { fragment } : {}) };
    } catch (error) {
        if (error instanceof EpubImportError) throw error;
        throw new EpubImportError(`EPUB 资源链接无效：${reference}`, { cause: error });
    }
}

/**
 * 必需资源不能为空或依赖网络。
 */
function resolveRequired(reference: string, basePath: string, message: string): EpubLinkTarget {
    const target = reference ? resolveReference(reference, basePath) : undefined;
    if (!target) throw new EpubImportError(message);
    return target;
}

/**
 * 按 XML 的 Unicode 编码读取；DTD 自定义实体不进入解析器。
 */
async function readXml(archive: EpubArchive, path: string): Promise<Document> {
    const bytes = await archive.read(path, MAX_XML_BYTES);
    let text: string;
    try {
        const encoding =
            bytes[0] === 0xff && bytes[1] === 0xfe
                ? "utf-16le"
                : bytes[0] === 0xfe && bytes[1] === 0xff
                  ? "utf-16be"
                  : bytes[0] === 0 && bytes[1] === 0x3c
                    ? "utf-16be"
                    : bytes[0] === 0x3c && bytes[1] === 0
                      ? "utf-16le"
                      : "utf-8";
        text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch (error) {
        throw new EpubImportError(`EPUB XML 不是有效的 Unicode 文本：${path}`, { cause: error });
    }
    return parseXml(text, path);
}

/**
 * XML 文档保持脱离页面，不挂载原始 DOM，也不加载其链接资源。
 */
function parseXml(text: string, path: string): Document {
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/iu.test(text)) throw new EpubImportError(`EPUB XML 包含不支持的自定义实体：${path}`);
    const document = new DOMParser().parseFromString(text, "application/xhtml+xml");
    if (document.documentElement.localName === "parsererror" || document.getElementsByTagName("parsererror").length > 0)
        throw new EpubImportError(`EPUB XML 已损坏：${path}`);
    return document;
}

/**
 * 常见 EPUB 3 和 EPUB 2 固定版式声明均显式拒绝。
 */
function rejectFixedLayout(document: Document): void {
    const fixed = descendants(document, "meta").some(
        (meta) =>
            (meta.getAttribute("property") === "rendition:layout" && meta.textContent.trim() === "pre-paginated") ||
            (meta.getAttribute("name") === "fixed-layout" && meta.getAttribute("content") === "true")
    );
    if (fixed) throw new EpubImportError("暂不支持固定版式 EPUB，请使用可重排版式的版本。");
}

/**
 * 系统字体替代被混淆的内嵌字体；其他加密资源属于不支持的 DRM 内容。
 */
async function rejectEncryption(archive: EpubArchive, manifest: Map<string, ManifestItem>): Promise<void> {
    if (!archive.has("META-INF/encryption.xml")) return;
    const document = await readXml(archive, "META-INF/encryption.xml");
    for (const encrypted of descendants(document, "EncryptedData")) {
        const algorithm = descendants(encrypted, "EncryptionMethod")[0]?.getAttribute("Algorithm") ?? "";
        const uri = descendants(encrypted, "CipherReference")[0]?.getAttribute("URI") ?? "";
        const target = resolveRequired(uri, "", "EPUB 的加密资源声明无效。");
        const type = manifest.get(target.path)?.mediaType ?? "";
        const font =
            type.startsWith("font/") ||
            [
                "application/vnd.ms-opentype",
                "application/font-sfnt",
                "application/font-woff",
                "application/x-font-ttf",
                "application/x-font-opentype",
            ].includes(type);
        if (!font || !fontObfuscationAlgorithms.has(algorithm))
            throw new EpubImportError("不支持包含 DRM 或加密正文、图片的 EPUB。");
    }
}

/**
 * 当前章节模型只接受可重排 XHTML，不把不支持的正文悄悄当作空章节。
 */
function assertContentType(item: ManifestItem): void {
    if (item.mediaType !== "application/xhtml+xml" && item.mediaType !== "text/html")
        throw new EpubImportError(`不支持此 EPUB 正文类型：${item.mediaType || "未声明"}`);
}

/**
 * 导航只提供章节名称，实际阅读顺序始终以 spine 为准。
 */
async function readNavigation(
    archive: EpubArchive,
    manifest: Map<string, ManifestItem>,
    ncx: ManifestItem | undefined
): Promise<NavigationEntry[]> {
    const entries: NavigationEntry[] = [];
    const targets = new Set<string>();
    /**
     * EPUB 3 优先于 NCX，相同目标只保留一个名称，保留同文档的不同片段。
     */
    const append = (target: EpubLinkTarget | undefined, title: string | undefined) => {
        if (!target || !title) return;
        const key = JSON.stringify([target.path, target.fragment]);
        if (targets.has(key)) return;
        if (entries.length >= 10_000) throw new EpubImportError("EPUB 目录过大，最多支持 10,000 个章节入口。");
        targets.add(key);
        entries.push({ target, title });
    };
    const navigation = [...manifest.values()].find((item) => item.properties.includes("nav"));
    if (navigation) {
        const document = await readXml(archive, navigation.path);
        const toc = descendants(document, "nav").find((element) =>
            tokens(
                element.getAttributeNS("http://www.idpf.org/2007/ops", "type") ?? element.getAttribute("epub:type")
            ).includes("toc")
        );
        if (toc) {
            for (const anchor of descendants(toc, "a")) {
                const target = resolveReference(anchor.getAttribute("href") ?? "", navigation.path);
                const title = anchor.textContent.trim();
                append(target, title);
            }
        }
    }
    if (ncx) {
        const document = await readXml(archive, ncx.path);
        for (const point of descendants(document, "navPoint")) {
            const content = Array.from(point.children).find((element) => element.localName === "content");
            const label = Array.from(point.children).find((element) => element.localName === "navLabel");
            const target = resolveReference(content?.getAttribute("src") ?? "", ncx.path);
            const title = label?.textContent.trim();
            append(target, title);
        }
    }
    return entries;
}

/**
 * 沿目录锚点切分同一正文，保留范围的祖先结构及切分前的列表序号。
 * anchors 只分配一次，供同路径中的跨章节链接定位；不依赖 CSS 选择器解释书内 id。
 */
async function parseSections(
    document: Document,
    body: Element,
    path: string,
    navigation: NavigationEntry[],
    context: ParseContext,
    sectionOffset: number
): Promise<EpubSection[]> {
    normalizeListNumbering(body);
    const elements = [body, ...Array.from(body.getElementsByTagName("*"))];
    const positions = new Map(elements.map((element, index) => [element, index]));
    const anchors = new Map<string, Element>();
    for (const element of elements) {
        const id = element.getAttribute("id") ?? (element.localName === "a" ? element.getAttribute("name") : null);
        if (id && !anchors.has(id)) anchors.set(id, element);
    }
    const entries = navigation.filter((entry) => entry.target.path === path);
    const title =
        entries.find((entry) => !entry.target.fragment)?.title ??
        (sectionTitle(document) || `第 ${String(sectionOffset + 1)} 节`);
    const boundaries = new Map<Element, string>([[body, title]]);
    for (const entry of entries) {
        if (!entry.target.fragment) continue;
        const element = anchors.get(entry.target.fragment);
        if (!element) throw new EpubImportError(`EPUB 目录引用了缺失的章节锚点：${path}#${entry.target.fragment}`);
        boundaries.set(element, entry.title);
    }
    const ordered = [...boundaries.entries()].sort(
        ([left], [right]) => (positions.get(left) ?? 0) - (positions.get(right) ?? 0)
    );
    const anchorPositions = [...anchors.entries()].map(([id, element]) => ({
        id,
        position: positions.get(element) ?? 0,
    }));
    const sections: EpubSection[] = [];
    let pendingAnchors: string[] = [];
    let nextAnchor = 0;
    for (const [index, [start, sectionName]] of ordered.entries()) {
        const end = ordered[index + 1]?.[0];
        const range = document.createRange();
        if (start === body) range.setStart(body, 0);
        else range.setStartBefore(start);
        if (end) range.setEndBefore(end);
        else range.setEnd(body, body.childNodes.length);
        let blocks = await parseChildren(cloneSection(range, body), path, context, 0);
        const endIndex = end ? (positions.get(end) ?? elements.length) : elements.length;
        const sectionAnchors: string[] = [];
        while (nextAnchor < anchorPositions.length) {
            const anchor = anchorPositions[nextAnchor];
            if (!anchor || anchor.position >= endIndex) break;
            sectionAnchors.push(anchor.id);
            nextAnchor++;
        }
        if (!hasReadableContent(blocks) && end) {
            pendingAnchors.push(...sectionAnchors);
            continue;
        }
        const ownedAnchors = [...pendingAnchors, ...sectionAnchors];
        const bodyId = body.getAttribute("id");
        const direction = body.getAttribute("dir");
        const dir = direction === "ltr" || direction === "rtl" || direction === "auto" ? direction : undefined;
        if (dir || (bodyId && ownedAnchors.includes(bodyId))) {
            blocks = [
                {
                    type: "element",
                    tag: "div",
                    children: blocks,
                    ...(dir ? { dir } : {}),
                    ...(bodyId && ownedAnchors.includes(bodyId) ? { id: bodyId } : {}),
                },
            ];
        }
        sections.push({
            title: sectionName,
            path,
            anchors: ownedAnchors,
            ...(pendingAnchors.length > 0 ? { startAnchors: pendingAnchors } : {}),
            blocks,
        });
        pendingAnchors = [];
    }
    return sections;
}

/**
 * Range 不复制共同祖先；补回至 body 内侧的结构，再统一经过安全内容投影。
 */
function cloneSection(range: Range, body: Element): DocumentFragment {
    const fragment = range.cloneContents();
    for (
        let ancestor: Node | null = range.commonAncestorContainer;
        ancestor instanceof Element && ancestor !== body;
        ancestor = ancestor.parentNode
    ) {
        const wrapper = ancestor.cloneNode(false);
        wrapper.appendChild(fragment);
        fragment.appendChild(wrapper);
    }
    return fragment;
}

/**
 * 在脱离页面的原始树中固定每个有序列表项的序号，避免切章后 start、reversed 或 value 重新计数。
 * 只处理当前列表的直属 li，嵌套列表分别确定自己的序号；不修改原文件字节。
 */
function normalizeListNumbering(body: Element): void {
    for (const list of descendants(body, "ol")) {
        const items = Array.from(list.children).filter((element) => element.localName === "li");
        const reversed = list.hasAttribute("reversed");
        let value = listInteger(list.getAttribute("start")) ?? (reversed ? items.length : 1);
        for (const item of items) {
            value = listInteger(item.getAttribute("value")) ?? value;
            item.setAttribute("value", String(value));
            value += reversed ? -1 : 1;
        }
    }
}

/**
 * 列表序号接受有符号整数，不把无效属性隐式转换为零。
 */
function listInteger(value: string | null): number | undefined {
    if (value === null || !/^-?\d+$/u.test(value.trim())) return undefined;
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : undefined;
}

/**
 * 优先可见章节标题，最后使用文档 title。
 */
function sectionTitle(document: Document): string {
    return ["h1", "h2", "title"].map((tag) => descendants(document, tag)[0]?.textContent.trim()).find(Boolean) ?? "";
}

/**
 * 顺序解析，避免同时解压多张大图片；空白文本保留以维持行内词间距。
 */
async function parseChildren(
    element: Element | DocumentFragment,
    path: string,
    context: ParseContext,
    depth: number
): Promise<EpubNode[]> {
    if (depth > MAX_ELEMENT_DEPTH) throw new EpubImportError("EPUB 正文嵌套过深，无法安全导入。");
    const nodes: EpubNode[] = [];
    for (const node of Array.from(element.childNodes)) {
        if (++context.nodeCount > MAX_CONTENT_NODES)
            throw new EpubImportError("EPUB 正文结构过于复杂，最多支持 500,000 个节点。");
        if ((node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) && node.textContent)
            nodes.push({ type: "text", text: node.textContent });
        else if (node instanceof Element) nodes.push(...(await parseElement(node, path, context, depth + 1)));
    }
    return nodes;
}

/**
 * 只投影白名单标签和属性，原始节点永远不会交给页面渲染。
 */
async function parseElement(element: Element, path: string, context: ParseContext, depth: number): Promise<EpubNode[]> {
    const tag = element.localName.toLowerCase();
    if (discardedTags.has(tag)) return [];
    if (unsupportedTags.has(tag)) throw new EpubImportError(`EPUB 包含尚不支持的正文内容：${tag}`);
    const id = element.getAttribute("id") ?? (tag === "a" ? element.getAttribute("name") : null);
    if (
        tag === "img" ||
        tag === "image" ||
        (tag === "object" && imageMediaTypes.has(element.getAttribute("type") ?? ""))
    ) {
        const reference =
            element.getAttribute("src") ??
            element.getAttribute("data") ??
            element.getAttribute("href") ??
            element.getAttributeNS("http://www.w3.org/1999/xlink", "href") ??
            "";
        const target = resolveRequired(reference, path, "EPUB 图片依赖外部资源或缺少路径，无法离线导入。");
        await loadImage(target.path, context);
        return [{ type: "image", path: target.path, alt: element.getAttribute("alt") ?? "", ...(id ? { id } : {}) }];
    }
    if (tag === "object") throw new EpubImportError("EPUB 包含尚不支持的嵌入对象。");
    if (tag === "svg" && element.namespaceURI === SVG_NAMESPACE) {
        // 常见封面 SVG 只是单张图片的定位包装，保留其实际图片而不保留固定页面尺寸。
        const images = descendants(element, "image");
        if (
            images.length === 1 &&
            Array.from(element.children).every((child) => ["image", "title", "desc"].includes(child.localName))
        ) {
            const image = images[0];
            if (image) {
                const children = await parseElement(image, path, context, depth);
                return id ? [{ type: "element", tag: "div", id, children }] : children;
            }
        }
        const resourcePath = `${path}#aura-inline-image-${String(++context.inlineImageCount)}`;
        const svg = sanitizeSvg(element, path);
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
        await validateImage(blob, path);
        context.resources.set(resourcePath, { path: resourcePath, blob });
        return [
            {
                type: "image",
                path: resourcePath,
                alt: descendants(element, "title")[0]?.textContent ?? "",
                ...(id ? { id } : {}),
            },
        ];
    }
    if (element.namespaceURI && element.namespaceURI !== XHTML_NAMESPACE)
        throw new EpubImportError(`EPUB 包含尚不支持的 XML 正文：${tag}`);

    const children = await parseChildren(element, path, context, depth);
    if (!isAllowedTag(tag)) return id ? [{ type: "element", tag: "span", id, children }] : children;
    const result: EpubElementNode = { type: "element", tag, children, ...(id ? { id } : {}) };
    const direction = element.getAttribute("dir");
    if (direction === "ltr" || direction === "rtl" || direction === "auto") result.dir = direction;
    if (tag === "a") {
        const href = element.getAttribute("href");
        const target = href ? resolveReference(href, path) : undefined;
        if (target) {
            result.href = target;
            context.links.push(target);
        }
    }
    if (tag === "td" || tag === "th") {
        const colSpan = tableSpan(element.getAttribute("colspan"), 1, 1_000);
        const rowSpan = tableSpan(element.getAttribute("rowspan"), 0, 65_534);
        if (colSpan !== undefined) result.colSpan = colSpan;
        if (rowSpan !== undefined) result.rowSpan = rowSpan;
    }
    if (tag === "ol") {
        const start = listInteger(element.getAttribute("start"));
        if (start !== undefined) result.start = start;
        if (element.hasAttribute("reversed")) result.reversed = true;
    }
    if (tag === "li") {
        const value = listInteger(element.getAttribute("value"));
        if (value !== undefined) result.value = value;
    }
    return [result];
}

/**
 * 将标签收窄为声明过的结构类型。
 */
function isAllowedTag(tag: string): tag is EpubElementTag {
    return elementTags.has(tag);
}

/**
 * HTML 表格跨度保持原生范围；rowspan 的零表示延续到当前行组末尾。
 */
function tableSpan(value: string | null, minimum: number, maximum: number): number | undefined {
    if (!value || !/^\d{1,5}$/u.test(value)) return undefined;
    const number = Number(value);
    return number >= minimum && number <= maximum ? number : undefined;
}

/**
 * 只有实际被正文引用的图片才解压、验证并保存。
 */
async function loadImage(path: string, context: ParseContext): Promise<void> {
    if (context.resources.has(path)) return;
    const item = context.manifest.get(path);
    if (!item || !imageMediaTypes.has(item.mediaType))
        throw new EpubImportError(`EPUB 图片未声明或类型不受支持：${path}`);
    let blob: Blob;
    if (item.mediaType === "image/svg+xml") {
        const document = await readXml(context.archive, path);
        const svg = sanitizeSvg(document.documentElement, path);
        blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: item.mediaType });
    } else {
        blob = new Blob([await context.archive.read(path)], { type: item.mediaType });
    }
    await validateImage(blob, path);
    context.resources.set(path, { path, blob });
}

/**
 * SVG 只能作为图片显示，移除执行入口并拒绝无法封闭在图片内的依赖。
 */
function sanitizeSvg(element: Element, path: string): Element {
    if (element.localName !== "svg" || element.namespaceURI !== SVG_NAMESPACE)
        throw new EpubImportError(`EPUB SVG 图片已损坏：${path}`);
    const copy = element.cloneNode(true);
    if (!(copy instanceof Element)) throw new EpubImportError(`EPUB SVG 图片无效：${path}`);
    for (const node of [copy, ...Array.from(copy.getElementsByTagName("*"))]) {
        if (node.localName === "script") {
            node.remove();
            continue;
        }
        if (["foreignObject", "iframe", "object", "embed"].includes(node.localName))
            throw new EpubImportError(`EPUB SVG 包含不支持的嵌入内容：${path}`);
        for (const attribute of Array.from(node.attributes)) {
            if (attribute.localName.toLowerCase().startsWith("on")) node.removeAttributeNode(attribute);
            else if (
                (attribute.localName === "href" && !attribute.value.trim().startsWith("#")) ||
                /url\(\s*["']?\s*(?!#)[^\s"')]/iu.test(attribute.value)
            )
                throw new EpubImportError(`EPUB SVG 依赖外部资源，无法离线导入：${path}`);
        }
        if (node.localName === "style" && /@import|url\(\s*["']?\s*(?!#)[^\s"')]/iu.test(node.textContent))
            throw new EpubImportError(`EPUB SVG 样式依赖外部资源：${path}`);
    }
    return copy;
}

/**
 * 在写入前通过浏览器图片解码器验证资源，临时 URL 始终撤销。
 */
async function validateImage(blob: Blob, path: string): Promise<void> {
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.src = url;
        try {
            await image.decode();
        } catch (error) {
            throw new EpubImportError(`EPUB 图片已损坏或当前浏览器无法解码：${path}`, { cause: error });
        }
        if (image.naturalWidth === 0 || image.naturalHeight === 0)
            throw new EpubImportError(`EPUB 图片没有有效尺寸：${path}`);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * 结构标记和空白本身不构成可阅读正文。
 */
function hasReadableContent(nodes: EpubNode[]): boolean {
    return nodes.some(
        (node) =>
            node.type === "image" ||
            (node.type === "text" ? node.text.trim().length > 0 : hasReadableContent(node.children))
    );
}
