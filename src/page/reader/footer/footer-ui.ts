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
import Ui from "../../../component/ui";
import { assertExists } from "../../../util/assert-util";

/**
 * 阅读器页脚界面
 * @author allurx
 */
export default class FooterUi extends Ui {
    private readonly chapterTitleElement: HTMLElement;
    private readonly progressRateElement: HTMLElement;

    public constructor(args: ConstructorParameters<typeof Ui>[0]) {
        super(args);
        this.chapterTitleElement = assertExists(this.root.querySelector<HTMLElement>("#chapter-title"));
        this.progressRateElement = assertExists(this.root.querySelector<HTMLElement>("#progress-rate"));
    }

    /**
     * 渲染章节标题
     * @param title - 标题
     * @return  当前实例
     */
    public renderChapterTitle(title: string) {
        this.chapterTitleElement.textContent = title;
        return this;
    }

    /**
     * 渲染进度
     * @param currentLineNumber - 当前行号
     * @param numberOfLines - 总行数
     * @return 当前实例
     */
    public renderProgress(currentLineNumber: number, numberOfLines: number) {
        const rate = numberOfLines === 0 ? 0 : Math.min(Math.max(currentLineNumber / numberOfLines, 0), 1);
        this.progressRateElement.textContent = `${(rate * 100).toFixed(2)}%`;
        return this;
    }
}
