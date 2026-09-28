/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import chardet, { type EncodingName } from "chardet";
import type { SupportedTextEncoding } from "./text-encoding";
import { canDecode } from "./text-file-reader";

// 每个采样位置最多读取64 KiB。
const SAMPLE_SEGMENT_SIZE_BYTES = 64 * 1024;

// 首选候选的最低置信度分数。
const MIN_CONFIDENCE_SCORE = 80;

// 受支持候选之间的最小置信度分差。
const MIN_SUPPORTED_CONFIDENCE_MARGIN_POINTS = 20;

/**
 * 按BOM、严格UTF-8、统计检测的顺序识别文件编码。
 * @param file - 待识别的TXT文件
 * @returns 已确认的编码，无法可靠判断时返回null
 */
export async function detectTextEncoding(file: File): Promise<SupportedTextEncoding | null> {
    // UTF系列BOM最长为4字节，只需读取文件头。
    const prefix = new Uint8Array(await file.slice(0, 4).arrayBuffer());

    // 先拒绝UTF-32 BOM，避免误判为UTF-16。
    if (startsWith(prefix, [0x00, 0x00, 0xfe, 0xff]) || startsWith(prefix, [0xff, 0xfe, 0x00, 0x00])) return null;
    if (startsWith(prefix, [0xef, 0xbb, 0xbf])) return await validateCandidate(file, "utf-8");
    if (startsWith(prefix, [0xfe, 0xff])) return await validateCandidate(file, "utf-16be");
    if (startsWith(prefix, [0xff, 0xfe])) return await validateCandidate(file, "utf-16le");

    const sample = await createSample(file);
    // 无BOM的UTF-16或二进制数据可能是合法UTF-8，TXT不接受NUL字节。
    if (sample.includes(0x00)) return null;

    // 全文件严格符合UTF-8时不再进行统计检测。
    if (await canDecode(file, "utf-8")) return "utf-8";

    // chardet按置信度降序返回候选，Aura只接受明确领先的传统中文编码。
    const matches = chardet.analyse(sample);
    const bestMatch = matches[0];
    if (!bestMatch || bestMatch.confidence < MIN_CONFIDENCE_SCORE) return null;

    const encoding = toSupportedLegacyEncoding(bestMatch.name);
    if (!encoding) return null;

    // 首选候选与次选同分时无法可靠判断。
    const runnerUp = matches[1];
    if (runnerUp?.confidence === bestMatch.confidence) return null;

    // 只比较受支持候选，避免被分数接近但不支持的编码干扰。
    const supportedRunnerUp = matches.slice(1).find((match) => toSupportedLegacyEncoding(match.name) !== null);
    if (
        supportedRunnerUp &&
        bestMatch.confidence - supportedRunnerUp.confidence < MIN_SUPPORTED_CONFIDENCE_MARGIN_POINTS
    )
        return null;

    // 统计结果仅作候选，最终仍需严格解码整个文件。
    return await validateCandidate(file, encoding);
}

/**
 * 创建统计检测样本，小文件读取全文，大文件读取头、中、尾。
 * @param file - 待采样的TXT文件
 * @returns 最大约192 KiB的字节样本
 */
async function createSample(file: File): Promise<Uint8Array> {
    const segmentSizeBytes = SAMPLE_SEGMENT_SIZE_BYTES;
    if (file.size <= segmentSizeBytes * 3) return new Uint8Array(await file.arrayBuffer());

    // 读取头、中、尾，避免仅凭ASCII文件头误判。
    const starts = [0, Math.floor((file.size - segmentSizeBytes) / 2), file.size - segmentSizeBytes];
    const segments = await Promise.all(
        starts.map(async (start) => new Uint8Array(await file.slice(start, start + segmentSizeBytes).arrayBuffer()))
    );

    // 预分配数组，避免反复拼接产生额外复制。
    const sample = new Uint8Array(segments.reduce((size, segment) => size + segment.length, segments.length - 1));
    let offset = 0;
    segments.forEach((segment, index) => {
        sample.set(segment, offset);
        offset += segment.length;
        if (index < segments.length - 1) sample[offset++] = 0x0a;
    });
    return sample;
}

/**
 * 判断文件头是否匹配指定BOM。
 * @param bytes - 文件头字节
 * @param signature - BOM字节序列
 * @returns 是否完整匹配
 */
function startsWith(bytes: Uint8Array, signature: number[]): boolean {
    return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * 将检测器名称转换为Aura支持的传统编码。
 * @param name - chardet返回的编码名称
 * @returns 对应编码，不受支持时返回null
 */
function toSupportedLegacyEncoding(name: EncodingName): SupportedTextEncoding | null {
    switch (name) {
        case "GB18030":
            return "gb18030";
        case "Big5":
            return "big5";
        default:
            return null;
    }
}

/**
 * 严格解码整个文件，验证候选编码。
 * @param file - 待验证的TXT文件
 * @param encoding - BOM或统计检测得到的候选编码
 * @returns 验证成功的编码，失败时返回null
 */
async function validateCandidate(file: File, encoding: SupportedTextEncoding): Promise<SupportedTextEncoding | null> {
    return (await canDecode(file, encoding)) ? encoding : null;
}
