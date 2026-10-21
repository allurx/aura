/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { bind, run } from "@/utils/event-util";

/**
 * 浮动面板的首选矩形，环境夹取不改变已保存的值。
 */
export interface PanelBounds {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

/**
 * 持久化由页面外观持有，提交异常沿现有 UI 错误路径传播。
 */
export interface PanelFrameBinding {
    getValue(): PanelBounds | undefined;
    commit(value: PanelBounds | undefined): Promise<void>;
    subscribe(listener: () => void, signal: AbortSignal): void;
}

interface PanelGesture {
    readonly pointerId: number;
    readonly resize: boolean;
    readonly x: number;
    readonly y: number;
    readonly bounds: PanelBounds;
    readonly viewport: PanelBounds;
    readonly preference: PanelBounds | undefined;
}

/**
 * 标题栏负责移动，尺寸由原生 CSS resize 调整；键盘入口共用标题栏。
 * 窄视口和贴边面板恢复原布局，不改变模态关闭或内部滚动流程。
 */
export default function enablePanelFrame(
    dialog: HTMLDialogElement,
    header: HTMLElement,
    isFloating: () => boolean,
    binding: PanelFrameBinding,
    signal: AbortSignal
): void {
    let preferred = binding.getValue();
    let gesture: PanelGesture | undefined;
    let nativeSize = "";
    let pendingCommits = 0;
    const pointers = new Set<number>();
    const title = header.querySelector("h2")?.textContent ?? "面板";
    const help = document.createElement("span");
    help.id = dialog.id + "-frame-help";
    help.hidden = true;
    help.textContent = "方向键移动面板，Shift 加方向键调整大小，Home 恢复默认位置和大小。";
    dialog.append(help);
    dialog.classList.add("panel-frame");
    const originalHeader = new Map(
        ["tabindex", "role", "title", "aria-label", "aria-describedby"].map((name) => [name, header.getAttribute(name)])
    );

    /**
     * 使用实际可视视口和安全区，缩放或软键盘出现时仍保留操作入口。
     */
    const available = (): PanelBounds => {
        const viewport = window.visualViewport;
        const style = getComputedStyle(dialog);
        const edge = (side: string): number =>
            Math.max(12, Number.parseFloat(style.getPropertyValue("--panel-safe-" + side)) || 0);
        const left = edge("left");
        const top = edge("top");
        return {
            left: (viewport?.offsetLeft ?? 0) + left,
            top: (viewport?.offsetTop ?? 0) + top,
            width: Math.max(1, (viewport?.width ?? innerWidth) - left - edge("right")),
            height: Math.max(1, (viewport?.height ?? innerHeight) - top - edge("bottom")),
        };
    };
    const enabled = (): boolean => (window.visualViewport?.width ?? innerWidth) > 800 && isFloating();

    /**
     * 环境夹取仅影响呈现；原生尺寸写入与模块自己的 CSS 变量分别维护。
     */
    const apply = (): void => {
        const adjustable = enabled();
        const changed = dialog.hasAttribute("data-panel-adjustable") !== adjustable;
        dialog.toggleAttribute("data-panel-adjustable", adjustable);
        if (adjustable && changed) {
            header.tabIndex = 0;
            header.setAttribute("role", "group");
            header.setAttribute("aria-label", "移动或调整" + title + "面板");
            header.setAttribute("aria-describedby", help.id);
            header.title = "拖动标题栏移动；方向键移动，Shift 加方向键调整大小，Home 恢复默认";
        } else if (!adjustable && changed) {
            for (const [name, value] of originalHeader) {
                if (value === null) header.removeAttribute(name);
                else header.setAttribute(name, value);
            }
        }
        if (!adjustable || !preferred) {
            dialog.removeAttribute("data-panel-positioned");
            return;
        }
        const viewport = gesture?.viewport ?? available();
        const width = Math.min(viewport.width, Math.max(320, preferred.width));
        const height = Math.min(viewport.height, Math.max(260, preferred.height));
        const left = Math.max(viewport.left, Math.min(preferred.left, viewport.left + viewport.width - width));
        const top = Math.max(viewport.top, Math.min(preferred.top, viewport.top + viewport.height - height));
        const values = {
            left,
            top,
            width,
            height,
            "maximum-width": viewport.left + viewport.width - left,
            "maximum-height": viewport.top + viewport.height - top,
        };
        for (const [name, value] of Object.entries(values)) {
            const property = "--panel-" + name;
            const next = String(value) + "px";
            if (dialog.style.getPropertyValue(property) !== next) dialog.style.setProperty(property, next);
        }
        dialog.setAttribute("data-panel-positioned", "");
    };

    /**
     * 原生手柄只在操作中保留 inline width/height，结束后回到同一持久化呈现路径。
     */
    const clearNativeSize = (): void => {
        nativeSize = "";
        dialog.style.removeProperty("width");
        dialog.style.removeProperty("height");
    };
    const finish = (): void => {
        const current = gesture;
        gesture = undefined;
        dialog.removeAttribute("data-panel-interacting");
        if (current && !current.resize && header.hasPointerCapture(current.pointerId))
            header.releasePointerCapture(current.pointerId);
        clearNativeSize();
        if (pendingCommits === 0) preferred = binding.getValue();
        apply();
    };
    const sync = (): void => {
        finish();
    };

    /**
     * 有效输入即时保存；失败恢复权威旧值并保留原异常。
     */
    const commit = async (value: PanelBounds | undefined): Promise<void> => {
        pendingCommits++;
        preferred = value;
        apply();
        try {
            await binding.commit(value);
        } catch (error) {
            if (!signal.aborted && pendingCommits === 1) {
                preferred = binding.getValue();
                finish();
            }
            throw error;
        } finally {
            pendingCommits--;
            if (!signal.aborted && pendingCommits === 0) {
                preferred = binding.getValue();
                apply();
            }
        }
    };

    /**
     * 浏览器原生 resize 写入普通 width/height；CSS 变量变化不进入提交路径。
     */
    const readNativeSize = async (): Promise<void> => {
        const width = dialog.style.width;
        const height = dialog.style.height;
        const signature = width + "|" + height;
        if ((!width && !height) || signature === nativeSize) return;
        nativeSize = signature;
        if (!gesture?.resize || !dialog.open || !enabled()) {
            clearNativeSize();
            apply();
            return;
        }
        const bounds = dialog.getBoundingClientRect();
        await commit({
            left: bounds.left,
            top: bounds.top,
            width: Math.max(320, bounds.width),
            height: Math.max(260, bounds.height),
        });
    };

    /**
     * 原生角部按下时固定当前左上角，但保留浏览器默认缩放；标题栏才使用指针捕获。
     */
    const begin = (event: PointerEvent, resizing: boolean): void => {
        if (!dialog.open || !enabled() || !event.isPrimary || event.button !== 0 || pointers.size !== 1) return;
        const selection = document.getSelection();
        if (
            !resizing &&
            ((event.target instanceof Element &&
                event.target.closest("button, a, input, select, textarea, summary, [contenteditable]")) ||
                (selection?.isCollapsed === false && dialog.contains(selection.anchorNode)))
        )
            return;
        const bounds = dialog.getBoundingClientRect();
        if (
            resizing &&
            (event.target !== dialog || event.clientX < bounds.right - 20 || event.clientY < bounds.bottom - 20)
        )
            return;
        if (!resizing) event.preventDefault();
        const preference = preferred;
        preferred = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
        gesture = {
            pointerId: event.pointerId,
            resize: resizing,
            x: event.clientX,
            y: event.clientY,
            bounds: preferred,
            viewport: available(),
            preference,
        };
        dialog.setAttribute("data-panel-interacting", "");
        apply();
        if (!resizing) header.setPointerCapture(event.pointerId);
    };
    const move = async (event: PointerEvent): Promise<void> => {
        const current = gesture;
        if (current?.pointerId !== event.pointerId || current.resize) return;
        const left = current.bounds.left + event.clientX - current.x;
        const top = current.bounds.top + event.clientY - current.y;
        await commit({
            left: Math.max(
                current.viewport.left,
                Math.min(left, current.viewport.left + current.viewport.width - current.bounds.width)
            ),
            top: Math.max(
                current.viewport.top,
                Math.min(top, current.viewport.top + current.viewport.height - current.bounds.height)
            ),
            width: current.preference?.width ?? Math.max(320, current.bounds.width),
            height: current.preference?.height ?? Math.max(260, current.bounds.height),
        });
    };

    /**
     * 标题栏提供原生尺寸手柄之外的键盘入口，不占用内部输入和目录方向键。
     */
    const keydown = async (event: KeyboardEvent): Promise<void> => {
        if (!enabled() || !dialog.open || event.target !== header || event.altKey || event.ctrlKey || event.metaKey)
            return;
        const directions: Readonly<Record<string, readonly [number, number]>> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
        };
        const direction = directions[event.key];
        if (!direction && event.key !== "Home") return;
        event.preventDefault();
        event.stopPropagation();
        finish();
        if (!direction) {
            await commit(undefined);
            return;
        }
        const bounds = dialog.getBoundingClientRect();
        const viewport = available();
        const previous = preferred;
        if (event.shiftKey) {
            await commit({
                left: bounds.left,
                top: bounds.top,
                width:
                    direction[0] === 0
                        ? (previous?.width ?? bounds.width)
                        : Math.max(
                              320,
                              Math.min(bounds.width + direction[0] * 16, viewport.left + viewport.width - bounds.left)
                          ),
                height:
                    direction[1] === 0
                        ? (previous?.height ?? bounds.height)
                        : Math.max(
                              260,
                              Math.min(bounds.height + direction[1] * 16, viewport.top + viewport.height - bounds.top)
                          ),
            });
        } else {
            await commit({
                left: Math.max(
                    viewport.left,
                    Math.min(bounds.left + direction[0] * 8, viewport.left + viewport.width - bounds.width)
                ),
                top: Math.max(
                    viewport.top,
                    Math.min(bounds.top + direction[1] * 8, viewport.top + viewport.height - bounds.height)
                ),
                width: previous?.width ?? Math.max(320, bounds.width),
                height: previous?.height ?? Math.max(260, bounds.height),
            });
        }
    };

    bind(
        document,
        "pointerdown",
        (event: PointerEvent) => {
            pointers.add(event.pointerId);
            if (pointers.size > 1) finish();
        },
        { capture: true, signal }
    );
    for (const type of ["pointerup", "pointercancel"] as const)
        bind(
            document,
            type,
            (event: PointerEvent) => {
                pointers.delete(event.pointerId);
                if (gesture?.pointerId === event.pointerId) finish();
            },
            { signal }
        );
    bind(
        header,
        "pointerdown",
        (event: PointerEvent) => {
            begin(event, false);
        },
        { signal }
    );
    bind(
        dialog,
        "pointerdown",
        (event: PointerEvent) => {
            begin(event, true);
        },
        { signal }
    );
    bind(dialog, "pointermove", move, { signal });
    bind(header, "lostpointercapture", finish, { signal });
    bind(header, "keydown", keydown, { signal });
    bind(dialog, "close", finish, { signal });
    binding.subscribe(() => {
        preferred = binding.getValue();
        finish();
    }, signal);
    window.addEventListener("resize", sync, { signal });
    window.visualViewport?.addEventListener("resize", sync, { signal });
    window.visualViewport?.addEventListener("scroll", sync, { signal });
    window.addEventListener(
        "blur",
        () => {
            finish();
            pointers.clear();
        },
        { signal }
    );
    const observer = new MutationObserver((records) => {
        run(async () => {
            if (records.some((record) => record.target === dialog && record.attributeName === "style"))
                await readNativeSize();
            if (signal.aborted) return;
            if (records.some((record) => record.target !== dialog || record.attributeName === "open")) sync();
        });
    });
    observer.observe(dialog, { attributes: true, attributeFilter: ["open", "style"] });
    if (dialog.parentElement) observer.observe(dialog.parentElement, { attributes: true });
    apply();

    signal.addEventListener(
        "abort",
        () => {
            observer.disconnect();
            finish();
            pointers.clear();
            help.remove();
            dialog.classList.remove("panel-frame");
            dialog.removeAttribute("data-panel-positioned");
            dialog.removeAttribute("data-panel-adjustable");
            for (const name of ["left", "top", "width", "height", "maximum-width", "maximum-height"])
                dialog.style.removeProperty("--panel-" + name);
            for (const [name, value] of originalHeader) {
                if (value === null) header.removeAttribute(name);
                else header.setAttribute(name, value);
            }
        },
        { once: true }
    );
}
