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

import Ui from "@/component/ui";
import EventUtil from "@/util/event-util";
import { SwitchChapterDirection } from "@/constant/switch-chapter-direction";
import FullscreenUtil from "@/util/fullscreen-util";

/**
 * Reader 使用的应用根界面
 * @author allurx
 */
export default class AppUi extends Ui {
    // 追踪指针信息
    private readonly pointer = {
        // 指针移动轨迹相对于x轴的角度
        angle: 0,
        // 指针类型 - mouse | touch
        type: "unknown",
        // 指针事件动作 - mouse click | touch click | touch horizontal swipe | touch vertical swipe
        action: "unknown",
        // 指针事件结束原因 - pointerup | pointercancel
        endCause: "unknown",
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        // 指针在x轴上的移动距离
        deltaX: 0,
        // 指针在y轴上的移动距离
        deltaY: 0,
        // 指针事件开始目标
        startTarget: null as EventTarget | null,
        // 指针事件结束目标
        endTarget: null as EventTarget | null,
        // 追踪触摸状态
        isTouching: false,
    };

    /**
     * 清理 Reader 写入持久应用根节点的临时状态。
     */
    public cleanup(): void {
        this.root.style.removeProperty("background-color");

        if (FullscreenUtil.getElement() === this.root) {
            EventUtil.run(() => FullscreenUtil.exit());
        }
    }

    public async toggleFullscreen(): Promise<void> {
        return FullscreenUtil.toggle(this.root);
    }

    /**
     * 绑定章节导航手势
     * @param targetElement - 目标元素
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    public bindChapterNavigation(
        targetElement: HTMLElement,
        handler: (direction: SwitchChapterDirection) => Promise<void>,
        signal: AbortSignal
    ): void {
        // 记录触摸起始位置
        EventUtil.bind(
            document,
            "pointerdown",
            (event: PointerEvent) => {
                this.pointer.type = event.pointerType;
                this.pointer.startTarget = event.target;
                this.pointer.endTarget = event.target;
                this.pointer.startX = event.clientX;
                this.pointer.startY = event.clientY;
                this.pointer.lastX = this.pointer.startX;
                this.pointer.lastY = this.pointer.startY;
                this.pointer.deltaX = 0;
                this.pointer.deltaY = 0;
                if (event.pointerType === "touch") this.pointer.isTouching = true;
            },
            { signal }
        );

        // 监听pointermove事件,记录触摸移动位置
        EventUtil.bind(
            document,
            "pointermove",
            (event: PointerEvent) => {
                this.pointer.endTarget = event.target;
                this.pointer.lastX = event.clientX;
                this.pointer.lastY = event.clientY;
            },
            { passive: true, signal }
        );

        // 浏览器或系统取消手势时只清理状态，不能把取消前的轨迹提交为章节切换。
        EventUtil.bind(
            document,
            "pointercancel",
            (event: PointerEvent) => {
                this.pointer.endCause = event.type;
                this.pointer.endTarget = event.target;
                this.pointer.action = "cancelled";
                this.pointer.isTouching = false;
            },
            { signal }
        );

        // 监听pointerup事件，只有正常结束的手势才判定章节切换方向。
        EventUtil.bind(
            document,
            "pointerup",
            async (event: PointerEvent) => {
                await handler(this.handlePointerEnd(targetElement, event));
            },
            { signal }
        );
    }

    /**
     * 处理正常结束的指针手势，判断是点击还是滑动。
     * @param targetElement - 目标元素
     * @param event - 指针事件
     * @param options - 配置选项
     * @param options.clickAndSwipeThreshold - 点击和滑动阈值(距离px) - 手指在x/y轴滑动距离同时小于该阈值时才算作点击
     * @param options.minSwipeAngle - 最小滑动角度阈值(度) - 确保是水平滑动
     * @return 章节切换方向或INVALID
     */
    private handlePointerEnd(
        targetElement: HTMLElement,
        event: PointerEvent,
        options = {
            clickAndSwipeThreshold: 8,
            minSwipeAngle: 30,
        }
    ) {
        // 章节切换方向
        let direction: SwitchChapterDirection = SwitchChapterDirection.INVALID;

        this.pointer.deltaX = this.pointer.lastX - this.pointer.startX;
        this.pointer.deltaY = this.pointer.lastY - this.pointer.startY;
        this.pointer.endCause = event.type;

        // 计算指针移动的距离(绝对值)
        const absDeltaX = Math.abs(this.pointer.deltaX);
        const absDeltaY = Math.abs(this.pointer.deltaY);

        // 计算指针移动的角度 - [0-90]°
        this.pointer.angle = (Math.atan2(absDeltaY, absDeltaX) * 180) / Math.PI;

        // 处理鼠标事件
        if (event.pointerType === "mouse") {
            this.pointer.action = "mouse click";

            // 鼠标左键点击时触发
            if (
                event.button === 0 &&
                this.pointer.startTarget === this.pointer.endTarget &&
                // 点击的是自己或者此刻reader宽度等于窗口宽度
                (event.target === this.root ||
                    (targetElement.offsetWidth === window.innerWidth &&
                        (event.target as HTMLElement).parentElement === targetElement))
            ) {
                if (this.pointer.lastX < window.innerWidth / 2) {
                    direction = SwitchChapterDirection.PREV;
                } else {
                    direction = SwitchChapterDirection.NEXT;
                }
            }
            // 处理触摸事件
        } else if (event.pointerType === "touch" && this.pointer.isTouching) {
            this.pointer.isTouching = false;

            // 检查是否在有效区域内
            if ((event.target as HTMLElement).parentElement === targetElement || event.target === targetElement) {
                // 点击 - 手指在x/y轴滑动距离同时小于该阈值时才算作点击
                if (absDeltaX < options.clickAndSwipeThreshold && absDeltaY < options.clickAndSwipeThreshold) {
                    this.pointer.action = "touch click";

                    // 点击左侧1/3区域
                    if (this.pointer.lastX < window.innerWidth / 3) {
                        direction = SwitchChapterDirection.PREV;

                        // 点击右侧1/3区域
                    } else if (this.pointer.lastX > (window.innerWidth / 3) * 2) {
                        direction = SwitchChapterDirection.NEXT;

                        // 点击中间区域
                    } else {
                        // do nothing
                    }

                    // 水平滑动 - 手指在x轴滑动距离超过该阈值才算滑动
                } else if (absDeltaX > options.clickAndSwipeThreshold) {
                    this.pointer.action = "touch horizontal swipe";

                    // 只有当滑动角度小于30度时才认为是水平滑动
                    if (this.pointer.angle < options.minSwipeAngle) {
                        if (this.pointer.deltaX > 0) {
                            // 向右滑动 - 上一章
                            direction = SwitchChapterDirection.PREV;
                        } else {
                            // 向左滑动 - 下一章
                            direction = SwitchChapterDirection.NEXT;
                        }
                    }

                    // 垂直滑动
                } else {
                    this.pointer.action = "touch vertical swipe";

                    // do nothing保留原有的滚动行为
                }
            }
        }

        // 不要打印引用对象,因为pointermove事件会持续更新pointer对象,导致打印时指针信息不准确
        console.log(
            "指针事件信息:",
            JSON.stringify(
                this.pointer,
                (_, value) => {
                    if (value instanceof HTMLElement) {
                        return {
                            tagName: value.tagName,
                            id: value.id,
                            className: value.className,
                            childrenCount: value.children.length,
                        };
                    }
                    return value as unknown;
                },
                4
            )
        );
        return direction;
    }
}
