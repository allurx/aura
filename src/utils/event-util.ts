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
 * Document 的事件映射包含页面使用的标准 DOM 事件；自定义事件保持基础 Event 契约。
 */
type BoundEvent<K extends string> = K extends keyof DocumentEventMap ? DocumentEventMap[K] : Event;

/**
 * 为已有节点绑定事件，保留原生监听选项及页面生命周期信号。
 */
export function bind<N extends Node, K extends string>(
    targetElement: N,
    eventType: K,
    handler: (event: BoundEvent<NoInfer<K>>, targetElement: N) => Promise<void> | void,
    options: AddEventListenerOptions = {}
): void {
    targetElement.addEventListener(
        eventType,
        (event) => {
            run(() => handler(event as BoundEvent<K>, targetElement));
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
