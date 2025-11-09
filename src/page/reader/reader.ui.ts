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
 * 阅读器界面
 * @author allurx
 */

import { assertExists } from "../../core/util/assert.util";
import Ui from "../../core/component/ui";

/**
 * 阅读器界面
 * @author allurx
 */
export default class ReaderUi extends Ui {
    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
    }

    /**
     * 绑定阅读器尺寸变化事件
     * @param  handler - 事件处理函数
     * @return 当前实例
     */
    public observeReaderResize(handler: (width: string) => Promise<void>) {
        new ResizeObserver(
            (() => {
                let timer: number;
                return (entries) => {
                    if (timer) clearTimeout(timer);
                    timer = window.setTimeout(() => {
                        void (async () => {
                            const entry = assertExists(entries[0]);
                            const width = entry.contentRect.width;
                            console.log("检测到页面宽度变化：", width);
                            await handler(String(width));
                        })();
                    }, 300);
                };
            })()
        ).observe(this.root);
        return this;
    }
}
