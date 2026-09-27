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
import FullscreenUtil from "@/utils/fullscreen-util";
import { SwitchChapterDirection } from "../switch-chapter-direction";

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
     * 清理阅读手势状态并退出当前阅读画布的全屏。
     */
    public cleanup(): void {
        this.pointer = undefined;
        this.activePointers.clear();
        if (FullscreenUtil.getElement() === this.root) EventUtil.run(() => FullscreenUtil.exit());
    }

    /**
     * 切换整个阅读画布的全屏状态。
     */
    public async toggleFullscreen(): Promise<void> {
        return FullscreenUtil.toggle(this.root);
    }

    /**
     * 区分正文两侧切章与中心工具入口，不拦截原生纵向滚动和文字选择。
     * @param content - 用于命中判断和滚动取消的正文容器。
     * @param onChapter - 将有效切章方向交给当前布局的业务处理器。
     * @param onCenterTap - 收到有效中心轻点后切换阅读工具。
     * @param signal - 页面生命周期，终止时移除全部指针与滚动监听。
     */
    public bindReadingGestures(
        content: HTMLElement,
        onChapter: (direction: SwitchChapterDirection) => Promise<void>,
        onCenterTap: () => void,
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
                if (!this.isReadingTarget(event.target, content)) return;
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

        // 正常抬起时先释放候选，再分发一次工具或切章操作。
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
     * 轻点要求 450ms 内且两轴全程位移小于 8px；触摸轻扫至少横移 48px，偏角不超过 30°。
     * 选区、多指、取消及正文滚动均忽略，鼠标拖选不作为轻扫。
     */
    private readGesture(
        content: HTMLElement,
        pointer: ReadingPointer,
        event: PointerEvent,
        onCenterTap: () => void
    ): SwitchChapterDirection {
        // 排除长按、选区和已交给浏览器处理的操作，避免把取消路径当成点击。
        if (
            pointer.cancelled ||
            !event.isPrimary ||
            event.button !== 0 ||
            this.activePointers.size > 0 ||
            this.hasSelection() ||
            Math.abs(content.scrollTop - pointer.scrollTop) > 1
        )
            return SwitchChapterDirection.INVALID;

        // 用全程位移判定轻点，再按正文的实际边界划分左右与中央区域。
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

        if (!inContent) return SwitchChapterDirection.INVALID;
        if (tap && event.timeStamp - pointer.startedAt <= 450) {
            if (horizontalPosition < 1 / 3) return SwitchChapterDirection.PREV;
            if (horizontalPosition > 2 / 3) return SwitchChapterDirection.NEXT;
            onCenterTap();
        } else if (
            (pointer.type === "touch" || pointer.type === "pen") &&
            Math.abs(deltaX) >= 48 &&
            maxY / Math.abs(deltaX) <= Math.tan(Math.PI / 6)
        ) {
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
