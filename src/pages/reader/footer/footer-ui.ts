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
import Ui from "@/components/ui";
import { assertExists } from "@/utils/assert-util";

/**
 * 阅读器页脚界面
 * @author allurx
 */
export default class FooterUi extends Ui {
    private readonly chapterTitleElement: HTMLElement;
    private readonly progressRateElement: HTMLElement;

    /**
     * 绑定底部章节信息。
     */
    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.chapterTitleElement = assertExists(this.root.querySelector<HTMLElement>("#chapter-title"));
        this.progressRateElement = assertExists(this.root.querySelector<HTMLElement>("#progress-rate"));
    }

    /**
     * 显示当前章名，截断后的完整文本保留为悬停提示。
     * @param title - 标题
     * @returns 当前实例。
     */
    public renderChapterTitle(title: string) {
        this.chapterTitleElement.textContent = title;
        this.chapterTitleElement.title = title;
        return this;
    }

    /**
     * 按全书物理行号显示百分比，空书为零并限制结果在有效范围内。
     * @param bookLineNumber - 当前正文行在全书中的物理行号
     * @param numberOfLines - 全书物理总行数
     * @returns 当前实例。
     */
    public renderProgress(bookLineNumber: number, numberOfLines: number) {
        this.progressRateElement.textContent = `${(
            (numberOfLines === 0 ? 0 : Math.min(Math.max(bookLineNumber / numberOfLines, 0), 1)) * 100
        ).toFixed(2)}%`;
        return this;
    }
}
