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

import Ui from "@/components/ui";
import EventUtil from "@/utils/event-util";
import { SwitchChapterDirection } from "../switch-chapter-direction";
import FullscreenUtil from "@/utils/fullscreen-util";

/**
 * 一次主指针操作；多指、取消或正文滚动会使本次手势失效。
 */
interface ReadingPointer {
    id: number;
    type: string;
    target: EventTarget | null;
    startX: number;
    startY: number;
    // 保留全程最大位移，避免拖动后回到起点被误判为轻点。
    maxX: number;
    maxY: number;
    startedAt: number;
    scrollTop: number;
    cancelled: boolean;
}

/**
 * 阅读器画布、全屏和正文指针手势。
 * @author allurx
 */
export default class AppUi extends Ui {
    private pointer: ReadingPointer | undefined;
    private readonly activePointers = new Set<number>();

    /**
     * 清理 Reader 写入持久应用根节点的临时状态。
     */
    public cleanup(): void {
        this.pointer = undefined;
        this.activePointers.clear();
        this.root.style.removeProperty("background-color");
        if (FullscreenUtil.getElement() === this.root) EventUtil.run(() => FullscreenUtil.exit());
    }

    /**
     * 切换整个阅读画布的全屏状态。
     */
    public async toggleFullscreen(): Promise<void> {
        return FullscreenUtil.toggle(this.root);
    }

    /**
     * 共用一条指针链识别切章和中心轻点，不拦截浏览器原生滚动或文字选择。
     * @param content - 用于命中判断和滚动取消的正文容器。
     * @param onChapter - 收到有效方向后执行的统一切章流程。
     * @param onCenterTap - 返回 true 表示已消费中心轻点，不能继续将其解释为切章。
     * @param signal - 页面生命周期，终止时移除全部指针与滚动监听。
     */
    public bindChapterNavigation(
        content: HTMLElement,
        onChapter: (direction: SwitchChapterDirection) => Promise<void>,
        onCenterTap: () => boolean,
        signal: AbortSignal
    ): void {
        // 只为单个主指针建立候选手势，多指或已存在的文本选区会取消本次候选。
        EventUtil.bind(
            document,
            "pointerdown",
            (event: PointerEvent) => {
                this.activePointers.add(event.pointerId);
                if (!event.isPrimary || this.activePointers.size !== 1 || event.button !== 0) {
                    if (this.pointer) this.pointer.cancelled = true;
                    return;
                }
                if (!this.isReadingTarget(event.target, content) && event.target !== this.root) return;
                this.pointer = {
                    id: event.pointerId,
                    type: event.pointerType,
                    target: event.target,
                    startX: event.clientX,
                    startY: event.clientY,
                    maxX: 0,
                    maxY: 0,
                    startedAt: event.timeStamp,
                    scrollTop: content.scrollTop,
                    cancelled: this.hasSelection(),
                };
            },
            { signal }
        );

        // 记录全程移动范围，拖动后返回起点也不能重新成为轻点。
        EventUtil.bind(
            document,
            "pointermove",
            (event: PointerEvent) => {
                const pointer = this.pointer;
                if (!pointer || pointer.id !== event.pointerId) return;
                pointer.maxX = Math.max(pointer.maxX, Math.abs(event.clientX - pointer.startX));
                pointer.maxY = Math.max(pointer.maxY, Math.abs(event.clientY - pointer.startY));
            },
            { passive: true, signal }
        );

        // 浏览器滚动和系统取消均终止候选，保留原生滚动与选择行为。
        EventUtil.bind(
            content,
            "scroll",
            () => {
                if (this.pointer) this.pointer.cancelled = true;
            },
            { passive: true, signal }
        );
        EventUtil.bind(
            document,
            "pointercancel",
            (event: PointerEvent) => {
                this.activePointers.delete(event.pointerId);
                if (this.pointer?.id === event.pointerId) this.pointer = undefined;
            },
            { signal }
        );

        // 正常抬起时先释放候选，再分发至多一次操作，异步切章不会复用旧状态。
        EventUtil.bind(
            document,
            "pointerup",
            async (event: PointerEvent) => {
                this.activePointers.delete(event.pointerId);
                const pointer = this.pointer;
                if (!pointer || pointer.id !== event.pointerId) return;
                this.pointer = undefined;
                const direction = this.readGesture(content, pointer, event, onCenterTap);
                if (direction !== SwitchChapterDirection.INVALID) await onChapter(direction);
            },
            { signal }
        );
    }

    /**
     * 仅识别 450ms 内的主指针操作；轻点要求两轴全程位移均小于 8px，避免长按和拖动误触。
     * 选区、多指、取消及正文滚动均忽略；中心回调优先于切章，水平轻扫另按方向判定。
     */
    private readGesture(
        content: HTMLElement,
        pointer: ReadingPointer,
        event: PointerEvent,
        onCenterTap: () => boolean
    ): SwitchChapterDirection {
        // 排除长按、选区和已交给浏览器处理的操作，避免把取消路径当成点击。
        if (
            pointer.cancelled ||
            !event.isPrimary ||
            event.button !== 0 ||
            this.activePointers.size > 0 ||
            this.hasSelection() ||
            event.timeStamp - pointer.startedAt > 450 ||
            Math.abs(content.scrollTop - pointer.scrollTop) > 1
        )
            return SwitchChapterDirection.INVALID;

        // 用全程位移判定轻点，并以正文实际边界划分左右及中央区域。
        const deltaX = event.clientX - pointer.startX;
        const deltaY = event.clientY - pointer.startY;
        const maxX = Math.max(pointer.maxX, Math.abs(deltaX));
        const maxY = Math.max(pointer.maxY, Math.abs(deltaY));
        const tap = maxX < 8 && maxY < 8;
        const bounds = content.getBoundingClientRect();
        const inContent =
            this.isReadingTarget(pointer.target, content) &&
            this.isReadingTarget(event.target, content) &&
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom;
        const horizontalPosition = (event.clientX - bounds.left) / bounds.width;

        // 移动端中心轻点由工具层优先消费，避免鼠标模拟触摸时又触发一次切章。
        if (tap && inContent && horizontalPosition >= 1 / 3 && horizontalPosition <= 2 / 3 && onCenterTap())
            return SwitchChapterDirection.INVALID;

        // 鼠标只在画布空白或全宽正文中翻章，保留居中阅读区内的普通文本操作。
        if (pointer.type === "mouse") {
            const canvasClick = pointer.target === this.root && event.target === this.root;
            const fullWidthContentClick = inContent && Math.abs(bounds.width - window.innerWidth) < 1;
            if (!tap || pointer.target !== event.target || (!canvasClick && !fullWidthContentClick))
                return SwitchChapterDirection.INVALID;
            return event.clientX < window.innerWidth / 2 ? SwitchChapterDirection.PREV : SwitchChapterDirection.NEXT;
        }

        // 触摸与笔输入支持两侧轻点和近水平轻扫，中心轻点或纵向动作不翻章。
        if (!inContent || (pointer.type !== "touch" && pointer.type !== "pen")) return SwitchChapterDirection.INVALID;
        if (tap) {
            if (horizontalPosition < 1 / 3) return SwitchChapterDirection.PREV;
            if (horizontalPosition > 2 / 3) return SwitchChapterDirection.NEXT;
        } else if (Math.abs(deltaX) > 8 && maxY / Math.abs(deltaX) < Math.tan(Math.PI / 6)) {
            return deltaX > 0 ? SwitchChapterDirection.PREV : SwitchChapterDirection.NEXT;
        }
        return SwitchChapterDirection.INVALID;
    }

    /**
     * 正文中的非交互元素可触发手势，章节按钮等控件保留自身行为。
     */
    private isReadingTarget(target: EventTarget | null, content: HTMLElement): boolean {
        return (
            target instanceof HTMLElement &&
            (target === content || content.contains(target)) &&
            !target.closest("button, a, input, textarea, select, summary, [contenteditable]")
        );
    }

    /**
     * 已有选区的清除以及正在创建的选区都不能误触阅读手势。
     */
    private hasSelection(): boolean {
        const selection = window.getSelection();
        return selection !== null && !selection.isCollapsed;
    }
}
