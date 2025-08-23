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

export default class Fullscreen {

    /**
     * 检查浏览器是否支持全屏api
     */
    static isSupported() {
        return document.fullscreenEnabled ||
            document.webkitFullscreenEnabled ||
            document.mozFullScreenEnabled ||
            document.msFullscreenEnabled;
    }

    /**
     * 是否有元素处于全屏状态
     */
    static isActive() {
        return Fullscreen.getElement() !== null;
    }

    /**
    * 获取当前全屏元素
    */
    static getElement() {
        return document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            null;
    }

    /**
     * 进入全屏
     */
    static enter(element) {
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        } else {
            return Promise.reject(new Error("当前设备不支持全屏操作"));
        }
    }

    /**
     * 退出全屏
     */
    static exit() {
        if (document.exitFullscreen) {
            return document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            return document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            return document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            return document.msExitFullscreen();
        } else {
            return Promise.resolve();
        }
    }

    /**
     * 切换全屏状态
     */
    static toggle(element) {
        return Fullscreen.isActive() ?
            Fullscreen.exit() :
            Fullscreen.enter(element);
    }

    /**
     * 监听全屏状态变化
     */
    static onChange(callback) {
        document.addEventListener("fullscreenchange", callback);
        document.addEventListener("webkitfullscreenchange", callback);
        document.addEventListener("mozfullscreenchange", callback);
        document.addEventListener("msfullscreenchange", callback);
    }
}
