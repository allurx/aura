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
 * 全屏工具类
 * @author allurx
 */
export default class FullscreenUtil {
    /**
     * 检查浏览器是否支持全屏api
     * @return  是否支持全屏
     */
    static isSupported(): boolean {
        return document.fullscreenEnabled;
    }

    /**
     * 是否有元素处于全屏状态
     * @return 是否有元素处于全屏状态
     */
    static isActive(): boolean {
        return FullscreenUtil.getElement() !== null;
    }

    /**
     * 获取当前全屏元素
     * @return 全屏元素或null
     */
    static getElement(): Element | null {
        return document.fullscreenElement ?? null;
    }

    /**
     * 进入全屏
     * @param  element - 需要全屏的元素
     * @return 全屏操作的Promise
     */
    static async enter(element: Element): Promise<void> {
        return element.requestFullscreen();
    }

    /**
     * 退出全屏
     * @return 退出全屏操作的Promise
     */
    static async exit(): Promise<void> {
        return document.exitFullscreen();
    }

    /**
     * 切换全屏状态
     * @param  element - 需要全屏的元素
     * @return 切换全屏操作的Promise
     */
    static async toggle(element: Element): Promise<void> {
        return FullscreenUtil.isActive() ? FullscreenUtil.exit() : FullscreenUtil.enter(element);
    }

    /**
     * 监听全屏状态变化
     * @param  callback - 回调函数
     */
    static onChange(callback: () => void): void {
        document.addEventListener("fullscreenchange", callback);
    }
}
