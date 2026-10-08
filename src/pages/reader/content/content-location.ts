/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 阅读位置引用受控正文的源内容，不引用字体、列号或屏幕坐标。
 * contentOffset 累计块内文本的 UTF-16 长度；img、br 和 hr 各占一个稳定位置。
 * 媒体占位使同一结构块中的相邻图片也能分别定位，不改变原始正文。
 */
export interface ContentLocation {
    readonly blockNumber: number;
    readonly contentOffset: number;
}

interface ContentUnit {
    readonly node: Text | HTMLElement;
    readonly offset: number;
    readonly length: number;
}

/**
 * 读取视窗内按内容顺序出现的首个可见字符或媒体；分页和滚动共用同一位置。
 * 标题可见时使用章首位置，临时视觉偏移由调用方独立保存。
 */
export function readContentLocation(section: HTMLElement, viewport: DOMRectReadOnly): ContentLocation | undefined {
    for (let index = firstVisibleBlock(section, viewport); index < section.children.length; index++) {
        const block = section.children[index];
        if (!(block instanceof HTMLElement)) continue;
        if (
            block.matches(".chapter-heading") &&
            [...block.getClientRects()].some((rect) => intersects(rect, viewport))
        ) {
            return { blockNumber: 1, contentOffset: 0 };
        }

        const blockNumber = Number(block.dataset["blockNumber"]);
        if (!Number.isInteger(blockNumber) || blockNumber < 1) continue;
        const blockVisible = [...block.getClientRects()].some((rect) => intersects(rect, viewport));
        if (!blockVisible) continue;
        let hasUnits = false;
        const scrollRegions = new Set<HTMLElement>();
        for (const unit of contentUnits(block)) {
            hasUnits = true;
            const region = scrollRegion(unit.node, block);
            if (region) {
                if (!scrollRegions.has(region)) {
                    scrollRegions.add(region);
                    const offset = readScrollRegionOffset(block, region, viewport);
                    if (offset !== undefined) return { blockNumber, contentOffset: offset };
                }
                continue;
            }

            const visible = visibleViewport(unit.node, block, viewport);
            if (!visible) continue;
            if (unit.node instanceof Text) {
                const offset = firstVisibleTextOffset(unit.node, visible);
                if (offset !== undefined) return { blockNumber, contentOffset: unit.offset + offset };
            } else if ([...unit.node.getClientRects()].some((rect) => intersects(rect, visible))) {
                return { blockNumber, contentOffset: unit.offset };
            }
        }

        // 无文本的空结构仍可成为位置，不能借用跨多列的整体包围盒判断可见性。
        if (!hasUnits) {
            return { blockNumber, contentOffset: 0 };
        }
    }
    return undefined;
}

/**
 * 受控正文块按源顺序排版，末片段也依次沿分页方向或纵轴推进。
 * 二分跳过视窗前的整块，跨列块仍从其首个可能可见片段开始精确读取。
 */
function firstVisibleBlock(section: HTMLElement, viewport: DOMRectReadOnly): number {
    const style = getComputedStyle(section);
    const paginated = style.columnWidth !== "auto";
    const rtl = style.direction === "rtl";
    let low = 0;
    let high = section.children.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const fragments = section.children[middle]?.getClientRects();
        const last = fragments?.[fragments.length - 1];
        // 未参与排版的块不提供顺序证据，保留原来的精确遍历。
        if (!last) return low;
        const before = paginated
            ? rtl
                ? last.left >= viewport.right - 0.01
                : last.right <= viewport.left + 0.01
            : last.bottom <= viewport.top + 0.01;
        if (before) low = middle + 1;
        else high = middle;
    }
    return low;
}

/**
 * 获取章节最后一个有排版位置的字符或媒体，供章末留白中的进度读取使用。
 * 跳过折叠空白与空块，不把章末重新解释为章首；代理对始终指向首个码元。
 */
export function endContentLocation(section: HTMLElement): ContentLocation | undefined {
    for (const block of [...section.children].reverse()) {
        if (!(block instanceof HTMLElement)) continue;
        const blockNumber = Number(block.dataset["blockNumber"]);
        if (!Number.isInteger(blockNumber) || blockNumber < 1) continue;

        const units = [...contentUnits(block)];
        for (const unit of units.reverse()) {
            if (unit.node instanceof Text) {
                const offset = lastTextOffset(unit.node);
                if (offset !== undefined) return { blockNumber, contentOffset: unit.offset + offset };
            } else if ([...unit.node.getClientRects()].some((rect) => rect.height > 0)) {
                return { blockNumber, contentOffset: unit.offset };
            }
        }
    }
    return undefined;
}

/**
 * 将源位置还原为单个字符或媒体的 Range，避免跨列块的联合包围盒丢失页码。
 * 内容末尾位置归于最后一个单元；不存在的内容块返回 undefined。
 */
export function locateContentRange(section: HTMLElement, location: ContentLocation): Range | undefined {
    const block = [...section.children].find(
        (element): element is HTMLElement =>
            element instanceof HTMLElement && Number(element.dataset["blockNumber"]) === location.blockNumber
    );
    if (!block) return undefined;

    let last: ContentUnit | undefined;
    for (const unit of contentUnits(block)) {
        last = unit;
        if (location.contentOffset < unit.offset + unit.length) {
            return unitRange(unit, Math.max(0, location.contentOffset - unit.offset));
        }
    }
    if (last) return unitRange(last, last.length - 1);

    const range = document.createRange();
    range.selectNode(block);
    return range;
}

/**
 * 获取源位置的实际片段矩形；单字符 Range 也可能因双向文字返回多个矩形。
 * 折叠空白的零宽矩形仍保留其插入位置，供章首恢复使用。
 */
export function locateContentRect(section: HTMLElement, location: ContentLocation): DOMRect | undefined {
    const range = locateContentRange(section, location);
    if (!range) return undefined;
    const rects = [...range.getClientRects()];
    return rects.find((rect) => rect.width > 0 && rect.height > 0) ?? rects.find((rect) => rect.height > 0);
}

/**
 * 按受控 DOM 的内容顺序遍历文本和媒体，内联标签不占位置。
 */
function* contentUnits(block: HTMLElement): Generator<ContentUnit> {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node = walker.nextNode();
    while (node) {
        if (
            (node instanceof Text && node.length > 0) ||
            (node instanceof HTMLElement && ["IMG", "BR", "HR"].includes(node.tagName))
        ) {
            const length = node instanceof Text ? node.length : 1;
            yield { node, offset, length };
            offset += length;
        }
        node = walker.nextNode();
    }
}

/**
 * 二分查找首个包含可见字符的文本前缀，不假定混合双向文字的横坐标单调。
 * 每次只测量 Range 片段，不逐字符扫描长段落。
 */
function firstVisibleTextOffset(node: Text, viewport: DOMRectReadOnly): number | undefined {
    const range = document.createRange();
    range.selectNodeContents(node);
    const visible = (): boolean => [...range.getClientRects()].some((rect) => intersects(rect, viewport));
    if (!visible()) return undefined;

    let low = 1;
    let high = node.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        range.setEnd(node, middle);
        if (visible()) high = middle;
        else low = middle + 1;
    }
    return codePointStart(node.data, low - 1);
}

/**
 * 二分查找仍包含可见字符的最后一个文本后缀，跳过尾部折叠空白。
 */
function lastTextOffset(node: Text): number | undefined {
    const range = document.createRange();
    range.selectNodeContents(node);
    const visible = (): boolean => [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
    if (!visible()) return undefined;

    let low = 0;
    let high = node.length - 1;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        range.setStart(node, middle);
        if (visible()) low = middle;
        else high = middle - 1;
    }
    return codePointStart(node.data, low);
}

/**
 * 将落在 UTF-16 代理对低位的偏移归到同一字符的高位，保留源序列计数方式。
 */
function codePointStart(text: string, offset: number): number {
    const current = text.charCodeAt(offset);
    const previous = text.charCodeAt(offset - 1);
    return current >= 0xdc00 && current <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff ? offset - 1 : offset;
}

/**
 * 用单个内容单元创建定位范围，媒体由元素本身表达其几何位置。
 */
function unitRange(unit: ContentUnit, offset: number): Range {
    const range = document.createRange();
    if (unit.node instanceof Text) {
        // UTF-16 偏移保持稳定，但定位范围不截断代理对表示的单个字符。
        const start = codePointStart(unit.node.data, offset);
        const codePoint = unit.node.data.codePointAt(start);
        const length = codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
        range.setStart(unit.node, start);
        range.setEnd(unit.node, Math.min(unit.node.length, start + length));
    } else {
        range.selectNode(unit.node);
    }
    return range;
}

/**
 * 查找独立滚动正文的最外层视窗，内嵌内容由浏览器命中测试确定实际可见位置。
 */
function scrollRegion(node: Node, block: HTMLElement): HTMLElement | undefined {
    let region: HTMLElement | undefined;
    for (let element = node.parentElement; element && element !== block; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (
            (["auto", "scroll"].includes(style.overflowX) && element.scrollWidth > element.clientWidth) ||
            (["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight)
        ) {
            region = element;
        }
    }
    return region;
}

/**
 * 跨列滚动区域在 WebKit 中可能把后代 Range 矩形折回相邻列；原生命中测试遵从实际绘制。
 * 只接受该区域内的文本或媒体，不把遮挡正文的浮层或邻接内容当作源位置。
 */
function readScrollRegionOffset(
    block: HTMLElement,
    region: HTMLElement,
    viewport: DOMRectReadOnly
): number | undefined {
    const visible = visibleViewport(region, block, viewport);
    if (!visible) return undefined;
    const bounds = region.getBoundingClientRect();
    const left = Math.max(visible.left, bounds.left + region.clientLeft);
    const right = Math.min(visible.right, bounds.left + region.clientLeft + region.clientWidth);
    const top = Math.max(visible.top, bounds.top + region.clientTop);
    const bottom = Math.min(visible.bottom, bounds.top + region.clientTop + region.clientHeight);
    if (right <= left || bottom <= top) return undefined;

    // 从阅读方向对应的上角读取内容，内边距和半截文字由原生 caret 定位处理。
    const inset = Math.min(1, (right - left) / 2);
    const x = getComputedStyle(region).direction === "rtl" ? right - inset : left + inset;
    const y = top + Math.min(1, (bottom - top) / 2);
    const caret =
        typeof document.caretPositionFromPoint === "function" ? document.caretPositionFromPoint(x, y) : undefined;
    let range: Range | null | undefined;
    if (caret === undefined && "caretRangeFromPoint" in document) {
        // 仅在标准接口缺失时使用浏览器既有的非标准等价接口，不按浏览器版本分支。
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- 兼容尚未提供 caretPositionFromPoint 的目标浏览器。
        range = document.caretRangeFromPoint(x, y);
    }
    const node = caret?.offsetNode ?? range?.startContainer;
    const offset = caret?.offset ?? range?.startOffset;
    if (!node || offset === undefined || !region.contains(node)) return undefined;

    if (node instanceof Text) {
        if (node.length === 0) return undefined;
        for (const unit of contentUnits(block)) {
            if (unit.node === node) {
                return unit.offset + codePointStart(node.data, Math.min(offset, node.length - 1));
            }
        }
        return undefined;
    }
    if (!(node instanceof HTMLElement)) return undefined;

    // 图片处的 caret 可指向父元素的子节点边界；精确映射该边界，不猜测整个单元格的第一张图。
    const following = node.childNodes[offset];
    const child = following ?? node.childNodes[offset - 1] ?? node;
    let candidate: ContentUnit | undefined;
    for (const unit of contentUnits(block)) {
        if (!child.contains(unit.node)) continue;
        candidate = unit;
        if (following) break;
    }
    return candidate?.node instanceof HTMLElement ? candidate.offset : undefined;
}

/**
 * 正文中的表格等独立滚动区域会裁剪后代；屏幕视窗须与这些裁剪区域求交。
 */
function visibleViewport(node: Node, block: HTMLElement, viewport: DOMRectReadOnly): DOMRect | undefined {
    let left = viewport.left;
    let right = viewport.right;
    let top = viewport.top;
    let bottom = viewport.bottom;
    for (let element = node.parentElement; element && element !== block; element = element.parentElement) {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) {
            left = Math.max(left, bounds.left);
            right = Math.min(right, bounds.right);
        }
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowY)) {
            top = Math.max(top, bounds.top);
            bottom = Math.min(bottom, bounds.bottom);
        }
    }
    return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : undefined;
}

/**
 * 仅有可见面积的片段可成为阅读锚点，排除折叠空白及相邻页边界。
 */
function intersects(rect: DOMRectReadOnly, viewport: DOMRectReadOnly): boolean {
    return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > viewport.left + 0.01 &&
        rect.left < viewport.right - 0.01 &&
        rect.bottom > viewport.top + 0.01 &&
        rect.top < viewport.bottom - 0.01
    );
}
