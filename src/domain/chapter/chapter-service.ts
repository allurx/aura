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

import BaseService from "@/domain/base-service";
import Chapter from "./chapter";
import ChapterRepository from "./chapter-repository";

/**
 * 章节服务
 * @author allurx
 */
export default class ChapterService extends BaseService<Chapter> {
    /**
     * 默认章节标题只由这一条正则判断。因为单行正则没有整本书的上下文，这里优先避免
     * 将正文误切成章节，而不是接受所有理论上可能出现的标题格式。
     *
     * 标题开头允许两种形式：
     * 1. 只有空白，兼容“    第一章 标题”这类缩进标题；
     * 2. 位于行首的短栏目名，例如“正文”“作品正文”“VIP章节”“章节目录”“作品相关”。
     *    栏目名以明确的结构词结尾，再以空白、冒号或连接号分隔；不接受任意短前缀，
     *    因此“天赋：1.属性”和“他翻到 第一章……”不会被误判。栏目名前不允许缩进，
     *    用于排除来源站点插入的缩进重复页眉。
     *
     * 支持的高置信度标题格式：
     * - 中文数字、阿拉伯数字、全角数字和大写中文数字组成的“第N章/回/节/卷/篇/部/集/话/幕/折/讲”；
     * - “卷N”“篇N”“部N”“集N”；
     * - “Chapter/Volume/Book/Part/Section + 数字、罗马数字或英文编号词”；
     * - “序章、楔子、前言、番外、终章、完本感言、Prologue、Epilogue”等特殊标题。
     *
     * 防误判约束：
     * - ^ 和 $ 要求章节格式占据整行，正文中间出现章节编号不会命中；
     * - “回/节/篇/部/集/话/幕/折/讲”后不能紧接字母或数字，排除“第一回合”“第一部分”；
     * - 标题剩余内容最多80个字符，拒绝章节标题和首段正文因缺少换行而粘连的长文本；
     * - 故意不识别“1.标题”，因为单行正则无法将它和正文中的有序列表可靠区分；
     * - i提供英文大小写兼容，u启用Unicode属性转义和正确的Unicode字符处理。
     */
    private readonly chapterRegex: RegExp =
        /^(?:[\t \u3000]*|[\p{L}\p{N}]{0,10}(?:正文|章节|章節|目录|目錄|相关|相關|[卷篇部集])(?:[\t \u3000]+|[\t \u3000]*[:：–—-][\t \u3000]*))(?:(?:第[\t \u3000]*[\p{N}零〇○一二三四五六七八九十百千万萬亿億两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟廿卅卌]{1,12}[\t \u3000]*(?:[章卷]|[回节節篇部集话話幕折讲講](?![\p{L}\p{N}])))|(?:[卷篇部集][\t \u3000]*[\p{N}零〇○一二三四五六七八九十百千万萬亿億两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟廿卅卌]{1,12})|(?:(?:Chapter|Volume|Book|Part|Section)[\t \u3000]*(?:\p{Nd}{1,7}|[IVXLCDM]{1,10}|[A-Z]{1,12}(?:-[A-Z]{1,12})?)(?![\p{L}\p{N}]))|(?:(?:序章|楔子|引子|序言|前言|后记|後記|尾声|尾聲|终章|終章|番外(?:篇|[\p{N}一二三四五六七八九十]{1,6})?|特别篇|特別篇|大结局|大結局|完本感言|完结感言|完結感言|Prologue|Epilogue|Preface|Introduction|Afterword)(?=$|[\t \u3000:：–—-])))[^\r\n]{0,80}$/iu;

    public constructor() {
        super(new ChapterRepository());
    }

    /**
     * 单次流式读取并解析章节。每一行只经过一次chapterRegex.test判断，不缓存全文，
     * 也不做前缀统计或第二轮扫描。
     *
     * @param file - 上传的文件
     * @param fileId - 文件id
     * @returns 章节列表
     */
    public async parseChapters(file: File, fileId: string): Promise<Chapter[]> {
        const chapters: Chapter[] = [];
        let chapterTitle: string | null = null;
        let chapterLines: string[] = [];
        let currentLineNumber = 1;

        // 标题行不保存在lines中，但仍占用一个物理行；前言和全文没有标题行，所以不增加这一行。
        const appendChapter = (title: string, lines: string[], includesTitle: boolean) => {
            const chapter = new Chapter({
                id: crypto.randomUUID(),
                fileId,
                index: chapters.length + 1,
                title,
                lines,
                startLineNumber: currentLineNumber,
                endLineNumber: currentLineNumber + lines.length + Number(includesTitle) - 1,
                createdTime: Date.now(),
                updatedTime: Date.now(),
            });
            chapters.push(chapter);
            currentLineNumber = chapter.endLineNumber + 1;
        };

        for await (const line of this.readLines(file)) {
            // 正则是唯一的章节边界判断；未命中的行（包括空行）原样归入当前章节。
            if (!this.chapterRegex.test(line)) {
                chapterLines.push(line);
                continue;
            }

            // 已有标题时封存上一章；首个标题之前只有真实文本才生成前言，纯空白不能制造空章节。
            const includesTitle = chapterTitle !== null;
            if (includesTitle || chapterLines.some((contentLine) => contentLine.trim().length > 0)) {
                appendChapter(chapterTitle ?? "前言", chapterLines, includesTitle);
            } else {
                // 即使不生成前言，前置空白仍是原文件中的物理行，必须推进行号以保持定位准确。
                currentLineNumber += chapterLines.length;
            }

            chapterTitle = line.trim();
            chapterLines = [];
        }

        // 无任何有效标题时整体作为“全文”；否则文件结束处封存最后一个已确认章节。
        appendChapter(chapterTitle ?? "全文", chapterLines, chapterTitle !== null);
        return chapters;
    }

    /**
     * 分块读取文件并按行输出，避免一次性将全文解码成一个大字符串。
     * 保留所有中间空行，不对用户文本整体trim；只移除CRLF中的CR，确保内容和物理行号稳定。
     *
     * @param file - 上传的文件
     * @returns 异步行迭代器
     */
    private async *readLines(file: File): AsyncGenerator<string> {
        const reader = file.stream().pipeThrough(new TextDecoderStream("UTF-8")).getReader();
        let remaining = "";
        try {
            for (;;) {
                const result = await reader.read();
                if (result.done) break;

                // UTF-8字符由TextDecoderStream处理；文本行仍可能横跨数据块，因此拼接上次未成行的残余。
                const text = remaining + result.value;
                let start = 0;
                let end = text.indexOf("\n");
                while (end >= 0) {
                    const line = text.slice(start, end);
                    // 以\n分行时只去掉CRLF配对的末尾\r，正文中其他位置的独立\r保持不变。
                    yield line.endsWith("\r") ? line.slice(0, -1) : line;
                    start = end + 1;
                    end = text.indexOf("\n", start);
                }
                remaining = text.slice(start);
            }
            // 文件以换行符结束时remaining为空，不额外制造一个原文件不存在的尾部空行。
            if (remaining.length > 0) yield remaining;
        } finally {
            reader.releaseLock();
        }
    }
}
