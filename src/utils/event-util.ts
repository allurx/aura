/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 将事件处理中的同步异常和 Promise 拒绝交给统一错误入口。
 */
export function run(handler: () => Promise<void> | void): void {
    void Promise.try(handler).catch((error: unknown) => {
        reportError(error);
    });
}

/**
 * 为已有节点绑定事件，保留原生监听选项及页面生命周期信号。
 */
export function bind<E extends Event, N extends Node>(
    targetElement: N,
    eventType: string,
    handler: (event: E, targetElement: N) => Promise<void> | void,
    options: AddEventListenerOptions = {}
): void {
    targetElement.addEventListener(
        eventType,
        (event) => {
            run(() => handler(event as E, targetElement));
        },
        options
    );
}

/**
 * 委托动态子节点的事件；选择器由应用提供，不接收外部文本。
 */
export function delegate(
    delegatorElement: HTMLElement,
    targetSelector: string,
    eventType: string,
    handler: (event: Event, targetElement: HTMLElement) => Promise<void> | void,
    options: AddEventListenerOptions = {}
): void {
    delegatorElement.addEventListener(
        eventType,
        (event) => {
            run(() => {
                if (!(event.target instanceof Element)) return;

                const targetElement = event.target.closest<HTMLElement>(targetSelector);
                if (targetElement && delegatorElement.contains(targetElement)) return handler(event, targetElement);
            });
        },
        options
    );
}
