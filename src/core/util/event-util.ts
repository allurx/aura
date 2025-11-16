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

/**
 * 事件工具类,支持委托绑定/直接绑定
 * @author allurx
 */
export default class EventUtil {
    private constructor() {
        throw new Error(`${EventUtil.name} is a static class and cannot be instantiated.`);
    }
    /**
     * 直接绑定 - 已存在元素
     * @template E - 事件类型
     * @template N - 目标元素类型
     * @param targetElement - 事件目标元素
     * @param eventType - 事件类型
     * @param handler - 事件处理函数
     * @param options - 事件选项
     */
    public static bind<E extends Event, N extends Node | Element>(
        targetElement: N,
        eventType: string,
        handler: (event: E, targetElement: N) => Promise<void> | void,
        options: AddEventListenerOptions = {}
    ): void {
        targetElement.addEventListener(
            eventType,
            (event) =>
                void (async () => {
                    await handler(event as E, targetElement);
                })(),
            options
        );
    }

    /**
     * 委托绑定 - 动态生成的元素
     * @param delegatorElement - 事件委托的目标元素
     * @param targetSelector - 事件目标元素选择器
     * @param eventType - 事件类型
     * @param handler - 事件处理函数
     * @param options - 事件选项
     */
    public static delegate(
        delegatorElement: HTMLElement,
        targetSelector: string,
        eventType: string,
        handler: (event: Event, targetElement: HTMLElement) => Promise<void> | void,
        options: AddEventListenerOptions = {}
    ): void {
        delegatorElement.addEventListener(
            eventType,
            (event) =>
                void (async () => {
                    const targetElement = (event.target as HTMLElement).closest(targetSelector);
                    if (targetElement) await handler(event, targetElement as HTMLElement);
                })(),
            options
        );
    }
}
