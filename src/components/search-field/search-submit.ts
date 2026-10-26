/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { assertExists } from "@/utils/assert-util";
import { bind } from "@/utils/event-util";

/**
 * 原生提交结束触摸端搜索编辑，保留查询和结果；桌面键盘仍可继续编辑。
 * 输入法候选确认由原生表单处理，不从按键事件推断提交。
 */
export function bindSearchSubmit(input: HTMLInputElement, isComposing: () => boolean, signal: AbortSignal): void {
    const form = assertExists(input.form);
    const touchPrimary = window.matchMedia("(hover: none) and (pointer: coarse)");
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
}
