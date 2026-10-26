/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { assertExists } from "@/utils/assert-util";
import { bind } from "@/utils/event-util";

/**
 * 原生提交或触摸结果区域时结束搜索编辑，保留搜索词与原生滚动。
 * 合成期间的首次结果触摸只结束输入，避免释放时选中重新筛选后的其他结果。
 * 鼠标浏览结果不主动移走输入焦点，桌面键盘提交后仍可继续编辑。
 * 输入法合成与确认由浏览器处理，不从按键事件推断提交。
 */
export function bindSearchInput(
    input: HTMLInputElement,
    results: HTMLElement,
    isComposing: () => boolean,
    signal: AbortSignal
): void {
    const form = assertExists(input.form);
    const touchPrimary = window.matchMedia("(hover: none) and (pointer: coarse)");
    let finishAfterComposition = false;
    let ignoreResultClick = false;

    bind(
        form,
        "submit",
        (event) => {
            event.preventDefault();
            if (isComposing()) return;

            const viewport = window.visualViewport;
            const viewportObscured =
                viewport?.scale === 1 && viewport.height < document.documentElement.clientHeight - 1;
            if (touchPrimary.matches || viewportObscured) input.blur();
        },
        { signal }
    );

    // 候选未确认时，当前结果仍属于旧查询；首次结果触摸只结束输入，不滚动旧结果。
    bind(
        input,
        "compositionstart",
        () => {
            results.setAttribute("data-search-composing", "");
        },
        { signal }
    );
    // 合成提交可能恢复输入焦点；提交完成后继续执行已经明确的结束编辑意图。
    bind(
        input,
        "compositionend",
        () => {
            results.removeAttribute("data-search-composing");
            if (!finishAfterComposition) return;
            finishAfterComposition = false;
            queueMicrotask(() => {
                if (!signal.aborted && document.activeElement === input) input.blur();
            });
        },
        { signal }
    );
    bind(
        input,
        "pointerdown",
        () => {
            // 用户重新操作输入框时，继续编辑优先于此前的结束意图。
            finishAfterComposition = false;
        },
        { signal, passive: true }
    );

    // 开始浏览结果即结束编辑；只记住需要等待合成提交的这一次结果触摸。
    bind(
        results,
        "pointerdown",
        (event) => {
            ignoreResultClick = false;
            if ((event.pointerType === "touch" || event.pointerType === "pen") && document.activeElement === input) {
                finishAfterComposition = isComposing();
                ignoreResultClick = finishAfterComposition;
                input.blur();
            }
        },
        { signal, passive: true }
    );
    bind(
        results,
        "click",
        (event) => {
            if (!ignoreResultClick || event.detail === 0) return;
            ignoreResultClick = false;
            event.preventDefault();
            event.stopPropagation();
        },
        { signal, capture: true }
    );
    signal.addEventListener(
        "abort",
        () => {
            results.removeAttribute("data-search-composing");
        },
        { once: true }
    );
}
