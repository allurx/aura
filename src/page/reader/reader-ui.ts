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

import EventUtil from "@/util/event-util";
import PageUi from "@/page/page-ui";

/**
 * 阅读器界面
 * @author allurx
 */
export default class ReaderUi extends PageUi {
    /**
     * 监听阅读器的首选宽度变化。
     * 响应式布局只改变实际宽度，不改变 inline width，因此不会被保存为用户偏好。
     * @param handler - 事件处理函数
     * @return 当前实例
     */
    public observePreferredWidth(handler: (width: string) => Promise<void>, signal: AbortSignal): this {
        if (signal.aborted) return this;

        let width = this.root.style.width;
        let timer: number | undefined;

        const observer = new MutationObserver(() => {
            if (signal.aborted) return;

            const newWidth = this.root.style.width;
            if (newWidth === width) return;

            width = newWidth;
            if (timer !== undefined) {
                window.clearTimeout(timer);
                timer = undefined;
            }

            // Reset 会移除 inline width；此时只取消待保存任务，不创建新的设置记录。
            if (!newWidth) return;

            timer = window.setTimeout(() => {
                EventUtil.run(async () => {
                    timer = undefined;
                    if (signal.aborted || this.root.style.width !== newWidth) return;
                    await handler(newWidth);
                });
            }, 300);
        });

        signal.addEventListener(
            "abort",
            () => {
                observer.disconnect();
                if (timer !== undefined) window.clearTimeout(timer);
            },
            { once: true }
        );
        observer.observe(this.root, { attributes: true, attributeFilter: ["style"] });
        return this;
    }
}
