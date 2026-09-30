/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { readLines } from "@/domain/file/text-file-reader";
import type { SupportedTextEncoding } from "@/domain/file/text-encoding";
import type Chapter from "./chapter";

/**
 * 单行正则是唯一的章节边界判定，优先避免将正文误切成章节。
 *
 * 行首允许空白缩进，或以“正文”“章节”“目录”等结构词结尾的短栏目名。
 * 栏目名必须紧贴行首，并与标题用空白、冒号或连接号分隔；不接受任意正文前缀。
 * 栏目名前禁止缩进，用于排除来源站点插入的缩进重复页眉。
 *
 * 识别中文“第 N 章”等编号、“卷 N”等卷篇编号、英文 Chapter 等编号，以及
 * “序章”“番外”“Prologue”等独立标题。中文编号支持常用数字与大写数字，
 * 英文编号接受数字、罗马数字和拉丁字母词组，不校验词组是否表示数值。
 *
 * 整行匹配与编号后的边界检查用于排除正文片段，例如“第一回合”“第一部分”。
 * 编号或特殊标题后的内容最多 80 个字符，减少标题与正文粘连造成的误判。
 * 故意不识别“1.标题”，因为缺少上下文时无法可靠区分正文中的有序列表。
 * i 忽略英文大小写，u 用于 Unicode 属性与字符匹配。
 */
const chapterRegex =
    /^(?:[\t \u3000]*|[\p{L}\p{N}]{0,10}(?:正文|章节|章節|目录|目錄|相关|相關|[卷篇部集])(?:[\t \u3000]+|[\t \u3000]*[:：–—-][\t \u3000]*))(?:(?:第[\t \u3000]*[\p{N}零〇○一二三四五六七八九十百千万萬亿億两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟廿卅卌]{1,12}[\t \u3000]*(?:[章卷]|[回节節篇部集话話幕折讲講](?![\p{L}\p{N}])))|(?:[卷篇部集][\t \u3000]*[\p{N}零〇○一二三四五六七八九十百千万萬亿億两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟廿卅卌]{1,12})|(?:(?:Chapter|Volume|Book|Part|Section)[\t \u3000]*(?:\p{Nd}{1,7}|[IVXLCDM]{1,10}|[A-Z]{1,12}(?:-[A-Z]{1,12})?)(?![\p{L}\p{N}]))|(?:(?:序章|楔子|引子|序言|前言|后记|後記|尾声|尾聲|终章|終章|番外(?:篇|[\p{N}一二三四五六七八九十]{1,6})?|特别篇|特別篇|大结局|大結局|完本感言|完结感言|完結感言|Prologue|Epilogue|Preface|Introduction|Afterword)(?=$|[\t \u3000:：–—-])))[^\r\n]{0,80}$/iu;

/**
 * 单次逐行扫描生成完整章节列表，不额外拼接全文字符串。
 * 显式标题从正文中移除，但仍计入全书物理行号；返回前保留全部章节正文。
 *
 * @param fileId - 供章节和目录共享的正文标识
 * @param encoding - 已通过全文件验证的编码
 */
export async function parseChapters(file: File, fileId: string, encoding: SupportedTextEncoding): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    let chapterTitle: string | null = null;
    let chapterLines: string[] = [];
    let currentBookLineNumber = 1;

    /**
     * 封存章节并推进物理行号；显式标题虽不进入 lines，仍占原文件一行。
     */
    const appendChapter = (title: string, lines: string[], hasExplicitTitleLine: boolean) => {
        const chapter: Chapter = {
            fileId,
            chapterNumber: chapters.length + 1,
            title,
            lines,
            startBookLineNumber: currentBookLineNumber,
            endBookLineNumber: currentBookLineNumber + lines.length + Number(hasExplicitTitleLine) - 1,
        };

        chapters.push(chapter);
        currentBookLineNumber = chapter.endBookLineNumber + 1;
    };

    for await (const line of readLines(file, encoding)) {
        // 未命中的行（包括空行）原样归入正文。
        if (!chapterRegex.test(line)) {
            chapterLines.push(line);
            continue;
        }

        // 首个标题之前的非空白文本作为前言，纯空白不单独成章。
        const hasExplicitTitleLine = chapterTitle !== null;
        if (hasExplicitTitleLine || chapterLines.some((contentLine) => contentLine.trim().length > 0)) {
            appendChapter(chapterTitle ?? "前言", chapterLines, hasExplicitTitleLine);
        } else {
            // 丢弃前置空白时仍累计物理行号，保持后续定位准确。
            currentBookLineNumber += chapterLines.length;
        }

        chapterTitle = line.trim();
        chapterLines = [];
    }

    // 没有匹配的标题时整本书作为“全文”。
    appendChapter(chapterTitle ?? "全文", chapterLines, chapterTitle !== null);
    return chapters;
}
