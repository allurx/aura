/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReaderToolsAppearance } from "@/settings/models/page-appearance";
import { assertExists } from "@/utils/assert-util";
import { bind } from "@/utils/event-util";

/**
 * 工具栏只投影外观偏好，保存与重置通知由设置控制器提供。
 */
export interface ReaderToolsBinding {
    getValue(): ReaderToolsAppearance;
    commit(value: ReaderToolsAppearance): void;
    subscribe(listener: () => void, signal: AbortSignal): void;
}

/**
 * 桌面工具栏的拖动、收起和视口约束；移动阅读继续使用独立的上下工具栏。
 */
export default class ReaderTools {
    public readonly body: HTMLElement;
    private readonly handle: HTMLButtonElement;
    private readonly toggle: HTMLButtonElement;
    private readonly heading: HTMLElement;
    private appearance: ReaderToolsAppearance = { collapsed: false };
    private binding: ReaderToolsBinding | undefined;
    private desktop = false;
    private suppressClick = false;
    private transition: readonly Animation[] | undefined;
    private drag:
        | {
              pointerId: number;
              target: HTMLButtonElement;
              startX: number;
              startY: number;
              left: number;
              top: number;
              position?: { left: number; top: number };
          }
        | undefined;

    public constructor(
        private readonly root: HTMLElement,
        private readonly reader: HTMLElement
    ) {
        this.body = assertExists(root.querySelector<HTMLElement>(".reader-tools-body"));
        this.handle = assertExists(root.querySelector<HTMLButtonElement>(".reader-tools-drag"));
        this.toggle = assertExists(root.querySelector<HTMLButtonElement>(".reader-tools-toggle"));
        this.heading = assertExists(root.querySelector<HTMLElement>(".reader-tools-heading"));
    }

    /**
     * 在首个异步步骤之前恢复外观；自提交通知只更新投影，不重建事件或指针捕获。
     */
    public bindAppearance(binding: ReaderToolsBinding, signal: AbortSignal): void {
        this.binding = binding;
        const refresh = (): void => {
            this.appearance = binding.getValue();
            this.render();
        };
        binding.subscribe(refresh, signal);
        refresh();
    }

    /**
     * 生命周期绑定一次；尺寸变化只夹取显示位置，不改写用户首选位置。
     */
    public bindControls(signal: AbortSignal): void {
        const observer = new ResizeObserver(() => {
            this.renderPosition();
        });
        observer.observe(this.reader);
        observer.observe(this.root);
        window.addEventListener(
            "resize",
            () => {
                this.render();
            },
            { signal }
        );
        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                this.stopTransition();
                this.cancelDrag();
            },
            { once: true }
        );

        for (const target of [this.handle, this.toggle]) {
            bind(
                target,
                "pointerdown",
                (event) => {
                    this.startDrag(event, target);
                },
                { signal }
            );
            bind(
                target,
                "pointermove",
                (event) => {
                    this.moveDrag(event);
                },
                { signal }
            );
            bind(
                target,
                "pointerup",
                (event) => {
                    this.finishDrag(event);
                },
                { signal }
            );
            bind(
                target,
                "pointercancel",
                () => {
                    this.cancelDrag();
                },
                { signal }
            );
            bind(
                target,
                "lostpointercapture",
                () => {
                    this.cancelDrag();
                },
                { signal }
            );
            bind(
                target,
                "keydown",
                (event) => {
                    this.moveWithKeyboard(event, target);
                },
                { signal }
            );
        }
        bind(
            this.toggle,
            "click",
            (event) => {
                if (this.suppressClick && event.detail > 0) {
                    this.suppressClick = false;
                    return;
                }
                this.toggleCollapsed();
            },
            { signal }
        );
        bind(
            document,
            "keydown",
            (event) => {
                if (event.key !== "Escape" || !this.drag) return;
                event.preventDefault();
                event.stopPropagation();
                this.cancelDrag();
            },
            { signal }
        );
    }

    /**
     * 响应式切换结束当前拖动，但不会改变桌面的收起偏好。
     */
    public setDesktop(desktop: boolean): void {
        if (this.desktop !== desktop) this.cancelDrag();
        this.desktop = desktop;
        this.render();
    }

    /**
     * 移动端聚焦的操作返回已收起的桌面栏时，接续到仍然可用的入口。
     */
    public getFocusTarget(target: HTMLElement): HTMLElement {
        return this.desktop && this.appearance.collapsed && this.body.contains(target) ? this.toggle : target;
    }

    /**
     * 模态期间跨回已收起的桌面栏时，原生返回目标已经隐藏，接续到保留的工具入口。
     */
    public restoreFocusAfterClose(dialog: HTMLDialogElement): void {
        if (!this.desktop || !this.appearance.collapsed || document.querySelector("dialog:modal")) return;
        if (document.activeElement === document.body || dialog.contains(document.activeElement))
            this.toggle.focus({ preventScroll: true });
    }

    /**
     * 保存成功后投影新状态；保存失败时保留旧偏好和显示，让统一错误入口反馈失败。
     */
    private commit(value: ReaderToolsAppearance): void {
        try {
            this.binding?.commit(value);
            this.appearance = value;
        } finally {
            this.render();
        }
    }

    /**
     * 收起时先接续隐藏区域的焦点，再同步像素和辅助技术状态。
     */
    private render(): void {
        this.stopTransition();
        const collapsed = this.appearance.collapsed;
        if (
            this.desktop &&
            collapsed &&
            (this.body.contains(document.activeElement) || document.activeElement === this.handle)
        )
            this.toggle.focus({ preventScroll: true });
        this.renderCollapsed(collapsed);
        this.toggle.setAttribute("aria-expanded", String(!collapsed));
        const label = collapsed ? "展开阅读工具" : "收起阅读工具";
        this.toggle.setAttribute("aria-label", label);
        this.toggle.title = collapsed ? `${label}；拖动可移动位置，方向键微调` : label;
        this.renderPosition();
    }

    /**
     * 目标状态始终即时保存；动画只投影视觉过程，不保存中间尺寸或位置。
     */
    private toggleCollapsed(): void {
        const from = this.root.getBoundingClientRect();
        const anchor = this.toggle.getBoundingClientRect();
        const opacity = this.body.hidden ? 0 : Number.parseFloat(getComputedStyle(this.body).opacity);
        this.stopTransition();
        const collapsed = !this.appearance.collapsed;

        // 测量目标形状，让同一个入口中心在收起、展开和快速反向时保持不动。
        this.renderCollapsed(collapsed);
        const bounds = this.root.getBoundingClientRect();
        const nextAnchor = this.toggle.getBoundingClientRect();
        this.commit({
            collapsed,
            position: {
                left: bounds.left + anchor.left + anchor.width / 2 - nextAnchor.left - nextAnchor.width / 2,
                top: bounds.top + anchor.top + anchor.height / 2 - nextAnchor.top - nextAnchor.height / 2,
            },
        });
        if (!this.desktop || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const to = this.root.getBoundingClientRect();
        const targetButton = this.toggle.getBoundingClientRect();

        // 内容使用完整展开尺寸，外壳只负责裁切，不在动画途中压缩图标或文字。
        this.renderCollapsed(false);
        const content = this.body.getBoundingClientRect();
        this.root.style.setProperty("--tools-content-height", `${content.height}px`);
        this.root.style.setProperty("--tools-content-width", `${content.width}px`);
        this.root.setAttribute("data-tools-animating", "");
        this.body.inert = true;
        this.heading.inert = true;
        const frame = (box: DOMRect): Keyframe => ({
            left: `${box.left}px`,
            top: `${box.top}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
        });
        const options: KeyframeAnimationOptions = {
            duration: 180,
            easing: "cubic-bezier(0.2, 0.65, 0.3, 1)",
            fill: "both",
        };
        const shell = this.root.animate([frame(from), frame(to)], options);
        const button = this.toggle.animate(
            [
                { height: `${anchor.height}px`, flexBasis: `${anchor.height}px` },
                { height: `${targetButton.height}px`, flexBasis: `${targetButton.height}px` },
            ],
            options
        );
        const contents = [this.heading, this.body].map((element) => {
            const offset = 6 + (element === this.heading ? content.height : 0);
            return element.animate(
                [
                    { opacity, bottom: `${anchor.height + offset}px` },
                    { opacity: collapsed ? 0 : 1, bottom: `${targetButton.height + offset}px` },
                ],
                options
            );
        });
        const transition = [shell, button, ...contents];
        this.transition = transition;
        void Promise.all(transition.map((animation) => animation.finished)).then(
            () => {
                if (this.transition === transition) this.render();
            },
            (error: unknown) => {
                if (this.transition !== transition) return;
                this.render();
                reportError(error);
            }
        );
    }

    /**
     * 显隐投影可在动画测量中使用；语义状态仍由保存后的偏好决定。
     */
    private renderCollapsed(collapsed: boolean): void {
        this.root.toggleAttribute("data-collapsed", collapsed);
        this.body.hidden = collapsed;
        this.handle.hidden = collapsed;
    }

    /**
     * 原生动画取消会拒绝 finished；先清除归属，让反向操作和销毁不误报错误。
     */
    private stopTransition(): void {
        const transition = this.transition;
        this.transition = undefined;
        transition?.forEach((animation) => {
            animation.cancel();
        });
        this.root.removeAttribute("data-tools-animating");
        this.root.style.removeProperty("--tools-content-height");
        this.root.style.removeProperty("--tools-content-width");
        this.body.inert = false;
        this.heading.inert = false;
    }

    /**
     * 默认靠近正文右侧；显式位置仅在当前视口内夹取，恢复尺寸时回到原偏好。
     */
    private renderPosition(position = this.drag?.position ?? this.appearance.position): void {
        if (!this.desktop || this.root.hidden || this.transition) return;
        const bounds = this.root.getBoundingClientRect();
        const reader = this.reader.getBoundingClientRect();
        const style = getComputedStyle(this.root);
        const inset = (side: string): number =>
            Math.max(8, Number.parseFloat(style.getPropertyValue(`--tools-safe-${side}`)) || 0);
        const left = Math.max(
            inset("left"),
            Math.min(position?.left ?? reader.right + 12, innerWidth - bounds.width - inset("right"))
        );
        const top = Math.max(
            inset("top"),
            Math.min(position?.top ?? (innerHeight - bounds.height) / 2, innerHeight - bounds.height - inset("bottom"))
        );
        this.root.style.left = `${left}px`;
        this.root.style.top = `${top}px`;
    }

    /**
     * 只在手柄或收起入口开始拖动，普通操作按钮仍然直接响应点击。
     */
    private startDrag(event: PointerEvent, target: HTMLButtonElement): void {
        if (!event.isPrimary) {
            this.cancelDrag();
            return;
        }
        if (
            !this.desktop ||
            this.transition ||
            event.button !== 0 ||
            (target === this.toggle && !this.appearance.collapsed)
        )
            return;
        this.suppressClick = false;
        const bounds = this.root.getBoundingClientRect();
        this.drag = {
            pointerId: event.pointerId,
            target,
            startX: event.clientX,
            startY: event.clientY,
            left: bounds.left,
            top: bounds.top,
        };
        target.setPointerCapture(event.pointerId);
    }

    /**
     * 微小抖动仍视为点击；达到阈值后仅更新浮层坐标，不触发布局偏好保存。
     */
    private moveDrag(event: PointerEvent): void {
        const drag = this.drag;
        if (drag?.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.position && Math.hypot(dx, dy) < 4) return;
        event.preventDefault();
        drag.position = { left: drag.left + dx, top: drag.top + dy };
        this.root.toggleAttribute("data-dragging", true);
        this.renderPosition();
    }

    /**
     * 完整拖动仅提交一次；指针取消与 Escape 回到拖动前的位置。
     */
    private finishDrag(event: PointerEvent): void {
        const drag = this.drag;
        if (drag?.pointerId !== event.pointerId) return;
        const bounds = this.root.getBoundingClientRect();
        this.releaseDrag();
        if (!drag.position) return;
        this.suppressClick = drag.target === this.toggle;
        this.commit({ ...this.appearance, position: { left: bounds.left, top: bounds.top } });
    }

    /**
     * 释放捕获之前清除手势，避免 lostpointercapture 重入取消已完成的操作。
     */
    private releaseDrag(): void {
        const drag = this.drag;
        this.drag = undefined;
        this.root.removeAttribute("data-dragging");
        if (drag?.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    }

    /**
     * 取消不保存，并阻止已发生移动的入口在后续 click 中意外展开。
     */
    private cancelDrag(): void {
        if (this.drag?.position && this.drag.target === this.toggle) this.suppressClick = true;
        this.releaseDrag();
        this.renderPosition();
    }

    /**
     * 手柄与收起入口支持方向键，Shift 加快移动；不将此按键交给正文翻页。
     */
    private moveWithKeyboard(event: KeyboardEvent, target: HTMLButtonElement): void {
        if (!this.desktop || (target === this.toggle && !this.appearance.collapsed)) return;
        const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if ((!dx && !dy) || event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        event.stopPropagation();
        if (this.transition) this.render();
        const bounds = this.root.getBoundingClientRect();
        const step = event.shiftKey ? 32 : 8;
        this.renderPosition({ left: bounds.left + dx * step, top: bounds.top + dy * step });
        const moved = this.root.getBoundingClientRect();
        this.commit({ ...this.appearance, position: { left: moved.left, top: moved.top } });
    }
}
