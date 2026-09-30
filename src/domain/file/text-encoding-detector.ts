/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import chardet, { type EncodingName } from "chardet";
import type { SupportedTextEncoding } from "./text-encoding";
import { canDecode } from "./text-file-reader";

// 每个采样位置最多读取 64 KiB。
const SAMPLE_SEGMENT_SIZE_BYTES = 64 * 1024;

// 首选候选的最低置信度分数。
const MIN_CONFIDENCE_SCORE = 80;

// 受支持候选之间的最小置信度分差。
const MIN_SUPPORTED_CONFIDENCE_MARGIN_POINTS = 20;

/**
 * 按 BOM、全文件严格 UTF-8 解码、统计检测的顺序识别编码。
 * 候选必须通过全文件严格解码；不受支持或无法可靠区分时返回 null。
 */
export async function detectTextEncoding(file: File): Promise<SupportedTextEncoding | null> {
    // BOM 最长为 4 字节；先排除 UTF-32，避免其前缀被误判为 UTF-16。
    const prefix = new Uint8Array(await file.slice(0, 4).arrayBuffer());

    if (startsWith(prefix, [0x00, 0x00, 0xfe, 0xff]) || startsWith(prefix, [0xff, 0xfe, 0x00, 0x00])) return null;
    if (startsWith(prefix, [0xef, 0xbb, 0xbf])) return await validateCandidate(file, "utf-8");
    if (startsWith(prefix, [0xfe, 0xff])) return await validateCandidate(file, "utf-16be");
    if (startsWith(prefix, [0xff, 0xfe])) return await validateCandidate(file, "utf-16le");

    const sample = await createSample(file);
    // 无 BOM 的 UTF-16 和部分二进制数据也能按 UTF-8 解码，样本含 NUL 时拒绝识别。
    if (sample.includes(0x00)) return null;

    // 全文件严格符合 UTF-8 时不再进行统计检测。
    if (await canDecode(file, "utf-8")) return "utf-8";

    // chardet 按置信度降序返回候选，只接受受支持且置信度足够的首选。
    const matches = chardet.analyse(sample);
    const bestMatch = matches[0];
    if (!bestMatch || bestMatch.confidence < MIN_CONFIDENCE_SCORE) return null;

    const encoding = toSupportedLegacyEncoding(bestMatch.name);
    if (!encoding) return null;

    // 任意次选同分都拒绝；除此之外，只要求与受支持次选拉开足够分差。
    const runnerUp = matches[1];
    if (runnerUp?.confidence === bestMatch.confidence) return null;

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
 * 小文件读取全文，大文件取头、中、尾，样本总量不超过 192 KiB 加两个分隔字节。
 */
async function createSample(file: File): Promise<Uint8Array> {
    const segmentSizeBytes = SAMPLE_SEGMENT_SIZE_BYTES;
    if (file.size <= segmentSizeBytes * 3) return new Uint8Array(await file.arrayBuffer());

    // 分散采样，避免仅凭 ASCII 文件头判断整本书。
    const starts = [0, Math.floor((file.size - segmentSizeBytes) / 2), file.size - segmentSizeBytes];
    const segments = await Promise.all(
        starts.map(async (start) => new Uint8Array(await file.slice(start, start + segmentSizeBytes).arrayBuffer()))
    );

    // 一次分配结果空间，用 LF 分隔不连续的片段，避免将两端字节当作相邻文本。
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
 * 判断文件头是否包含完整的 BOM 字节序列。
 */
function startsWith(bytes: Uint8Array, signature: number[]): boolean {
    return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * 将 chardet 的传统编码名称映射为解码器标签，不受支持时返回 null。
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
 * 候选编码通过全文件严格解码后才接受，否则返回 null。
 */
async function validateCandidate(file: File, encoding: SupportedTextEncoding): Promise<SupportedTextEncoding | null> {
    return (await canDecode(file, encoding)) ? encoding : null;
}
