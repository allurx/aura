/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { Inflate } from "fflate";
import { getBookSizeRejection } from "./book-file-limits";

// 按浏览器中的单本书预算限制归档规模，避免恶意目录或高度压缩内容耗尽内存。
const MAX_ENTRIES = 10_000;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_DIRECTORY_BYTES = 16 * 1024 * 1024;
const INPUT_CHUNK_BYTES = 16 * 1024;

/**
 * 可向用户说明的 EPUB 格式拒绝；存储和读取等其他异常不转换为格式错误。
 */
export class EpubImportError extends Error {
    /**
     * 保留格式校验或解码失败的原始原因。
     */
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "EpubImportError";
    }
}

/**
 * ZIP 中央目录中的单个文件，不保留解压后的内容。
 */
interface ZipEntry {
    path: string;
    method: number;
    flags: number;
    crc: number;
    compressedSize: number;
    size: number;
    offset: number;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

/**
 * 核对归档路径；只接受书内相对路径，不解析为本机文件系统路径。
 */
function archivePath(path: string): string {
    if (
        !path ||
        path.startsWith("/") ||
        path.includes("\\") ||
        Array.from(path).some((character) => character.charCodeAt(0) < 32) ||
        path.split("/").some((part) => part === "." || part === "..")
    ) {
        throw new EpubImportError("EPUB 包含无效的书内文件路径。");
    }
    return path;
}

/**
 * 文件名遵从 EPUB 的 UTF-8 要求，不使用系统代码页猜测。
 */
function decodePath(bytes: Uint8Array): string {
    try {
        return archivePath(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
        if (error instanceof EpubImportError) throw error;
        throw new EpubImportError("EPUB 文件名不是有效的 UTF-8。", { cause: error });
    }
}

/**
 * 核对扩展字段的边界，提取唯一的 ZIP64 数据；其他合法扩展直接跳过。
 */
function zip64Extra(data: DataView, start: number, end: number): DataView | undefined {
    let result: DataView | undefined;
    for (let cursor = start; cursor < end;) {
        if (cursor + 4 > end) throw new EpubImportError("EPUB 归档扩展字段不完整。");
        const tag = data.getUint16(cursor, true);
        const size = data.getUint16(cursor + 2, true);
        const next = cursor + 4 + size;
        if (next > end) throw new EpubImportError("EPUB 归档扩展字段不完整。");
        if (tag === 0x0001) {
            if (result) throw new EpubImportError("EPUB 包含重复的 ZIP64 扩展字段。");
            result = new DataView(data.buffer, data.byteOffset + cursor + 4, size);
        }
        cursor = next;
    }
    return result;
}

/**
 * 解析普通或 ZIP64 目录位置；64 位声明先按预算和实际文件范围校验，再转换为 number。
 */
async function readDirectory(file: File): Promise<{ count: number; size: number; offset: number }> {
    const tailOffset = Math.max(0, file.size - 65_557);
    const tail = new DataView(await file.slice(tailOffset).arrayBuffer());
    let end = tail.byteLength - 22;
    while (end >= 0) {
        if (tail.getUint32(end, true) === 0x06054b50 && end + 22 + tail.getUint16(end + 20, true) === tail.byteLength)
            break;
        end--;
    }
    if (end < 0) throw new EpubImportError("文件不是完整的 EPUB ZIP 归档。");

    const disk = tail.getUint16(end + 4, true);
    const startDisk = tail.getUint16(end + 6, true);
    const diskCount = tail.getUint16(end + 8, true);
    const count = tail.getUint16(end + 10, true);
    const size = tail.getUint32(end + 12, true);
    const offset = tail.getUint32(end + 16, true);
    let directoryEnd = BigInt(tailOffset + end);
    let expandedCount = BigInt(count);
    let expandedSize = BigInt(size);
    let expandedOffset = BigInt(offset);

    // 最大长度的 ZIP 注释会把 locator 留在尾缓冲之前，按绝对位置独立读取。
    const locatorOffset = tailOffset + end - 20;
    const locator = new DataView(await file.slice(Math.max(0, locatorOffset), tailOffset + end).arrayBuffer());
    const hasZip64 = locator.byteLength === 20 && locator.getUint32(0, true) === 0x07064b50;
    if (hasZip64) {
        if (locator.getUint32(4, true) !== 0 || locator.getUint32(16, true) !== 1)
            throw new EpubImportError("不支持分卷 EPUB 归档。");
        const recordOffset = locator.getBigUint64(8, true);
        if (recordOffset + 56n > BigInt(locatorOffset)) throw new EpubImportError("EPUB ZIP64 目录位置无效。");
        const record = new DataView(await file.slice(Number(recordOffset), Number(recordOffset) + 56).arrayBuffer());
        if (
            record.byteLength !== 56 ||
            record.getUint32(0, true) !== 0x06064b50 ||
            record.getBigUint64(4, true) < 44n ||
            recordOffset + 12n + record.getBigUint64(4, true) !== BigInt(locatorOffset)
        )
            throw new EpubImportError("EPUB ZIP64 目录记录不完整。");
        if (record.getUint32(16, true) !== 0 || record.getUint32(20, true) !== 0)
            throw new EpubImportError("不支持分卷 EPUB 归档。");

        expandedCount = record.getBigUint64(32, true);
        expandedSize = record.getBigUint64(40, true);
        expandedOffset = record.getBigUint64(48, true);
        if (
            (disk !== 0 && disk !== 0xffff) ||
            (startDisk !== 0 && startDisk !== 0xffff) ||
            record.getBigUint64(24, true) !== expandedCount ||
            (diskCount !== 0xffff && BigInt(diskCount) !== expandedCount) ||
            (count !== 0xffff && BigInt(count) !== expandedCount) ||
            (size !== 0xffffffff && BigInt(size) !== expandedSize) ||
            (offset !== 0xffffffff && BigInt(offset) !== expandedOffset)
        )
            throw new EpubImportError("EPUB ZIP64 目录与普通目录声明不一致。");
        directoryEnd = recordOffset;
    } else {
        if ([disk, startDisk, diskCount, count].includes(0xffff) || size === 0xffffffff || offset === 0xffffffff)
            throw new EpubImportError("EPUB 缺少 ZIP64 目录记录。");
        if (disk !== 0 || startDisk !== 0) throw new EpubImportError("不支持分卷 EPUB 归档。");
        if (diskCount !== count) throw new EpubImportError("EPUB 归档目录已损坏。");
    }

    if (expandedCount > BigInt(MAX_ENTRIES)) throw new EpubImportError("EPUB 归档条目过多，最多支持 10,000 个文件。");
    if (expandedSize > BigInt(MAX_DIRECTORY_BYTES)) throw new EpubImportError("EPUB 归档目录超过 16 MiB 的限制。");
    if (expandedOffset + expandedSize > directoryEnd) throw new EpubImportError("EPUB 归档目录已损坏。");
    return { count: Number(expandedCount), size: Number(expandedSize), offset: Number(expandedOffset) };
}

/**
 * 读取中央目录后按需解压；每次只保留当前资源，避免展开整个 EPUB。
 */
export class EpubArchive {
    private constructor(
        private readonly file: File,
        private readonly entries: Map<string, ZipEntry>,
        private readonly directoryOffset: number
    ) {}

    /**
     * 先检查完整目录和声明的展开量，再允许读取任何正文或图片。
     */
    public static async open(file: File): Promise<EpubArchive> {
        const sizeRejection = getBookSizeRejection(file.size, "epub");
        if (sizeRejection) throw new EpubImportError(sizeRejection);
        const { count, size: directorySize, offset: directoryOffset } = await readDirectory(file);
        const directory = new DataView(
            await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer()
        );
        const entries = new Map<string, ZipEntry>();
        let cursor = 0;
        let totalSize = 0;
        for (let index = 0; index < count; index++) {
            if (cursor + 46 > directory.byteLength || directory.getUint32(cursor, true) !== 0x02014b50)
                throw new EpubImportError("EPUB 归档目录已损坏。");
            const nameSize = directory.getUint16(cursor + 28, true);
            const extraStart = cursor + 46 + nameSize;
            const extraEnd = extraStart + directory.getUint16(cursor + 30, true);
            const entryEnd = extraEnd + directory.getUint16(cursor + 32, true);
            if (entryEnd > directory.byteLength) throw new EpubImportError("EPUB 归档目录不完整。");
            const path = decodePath(new Uint8Array(directory.buffer, cursor + 46, nameSize));
            const extra = zip64Extra(directory, extraStart, extraEnd);
            let extraCursor = 0;
            /**
             * ZIP64 只为哨兵字段提供值，按未压缩大小、压缩大小、偏移和磁盘号依次读取。
             */
            const expanded = (value: number, sentinel: number, bytes: 4 | 8): bigint => {
                if (value !== sentinel) return BigInt(value);
                if (!extra || extraCursor + bytes > extra.byteLength)
                    throw new EpubImportError(`EPUB ZIP64 扩展字段缺失或不完整：${path}`);
                const result =
                    bytes === 8 ? extra.getBigUint64(extraCursor, true) : BigInt(extra.getUint32(extraCursor, true));
                extraCursor += bytes;
                return result;
            };
            const size = expanded(directory.getUint32(cursor + 24, true), 0xffffffff, 8);
            const compressedSize = expanded(directory.getUint32(cursor + 20, true), 0xffffffff, 8);
            const offset = expanded(directory.getUint32(cursor + 42, true), 0xffffffff, 8);
            const disk = expanded(directory.getUint16(cursor + 34, true), 0xffff, 4);
            if (disk !== 0n) throw new EpubImportError("不支持分卷 EPUB 归档。");
            if (size > BigInt(MAX_ENTRY_BYTES) || BigInt(totalSize) + size > BigInt(MAX_TOTAL_BYTES))
                throw new EpubImportError("EPUB 展开后过大：单个文件最多 64 MiB，全书最多 512 MiB。");
            if (offset + 30n + compressedSize > BigInt(directoryOffset))
                throw new EpubImportError("EPUB 归档中的文件位置无效。");

            const entry: ZipEntry = {
                path,
                flags: directory.getUint16(cursor + 8, true),
                method: directory.getUint16(cursor + 10, true),
                crc: directory.getUint32(cursor + 16, true),
                compressedSize: Number(compressedSize),
                size: Number(size),
                offset: Number(offset),
            };
            totalSize += entry.size;
            if (entry.flags & 1) throw new EpubImportError("不支持加密或需要密码的 EPUB。");
            if (entries.has(path)) throw new EpubImportError(`EPUB 存在重复的书内路径：${path}`);
            entries.set(path, entry);
            cursor = entryEnd;
        }
        return new EpubArchive(file, entries, directoryOffset);
    }

    /**
     * 判断资源是否存在，不触发解压。
     */
    public has(path: string): boolean {
        return this.entries.has(path);
    }

    /**
     * 按中央目录限定读取范围，流式解压并核对实际长度与 CRC。
     */
    public async read(path: string, limit = MAX_ENTRY_BYTES): Promise<Uint8Array<ArrayBuffer>> {
        const entry = this.entries.get(path);
        if (!entry) throw new EpubImportError(`EPUB 缺少文件：${path}`);
        if (entry.size > limit) throw new EpubImportError(`EPUB 文件过大：${path}`);
        if (entry.method !== 0 && entry.method !== 8) throw new EpubImportError(`EPUB 使用了不支持的压缩方式：${path}`);

        const local = new DataView(await this.file.slice(entry.offset, entry.offset + 30).arrayBuffer());
        if (
            local.byteLength !== 30 ||
            local.getUint32(0, true) !== 0x04034b50 ||
            local.getUint16(8, true) !== entry.method
        )
            throw new EpubImportError(`EPUB 文件头已损坏：${path}`);
        const nameSize = local.getUint16(26, true);
        const start = entry.offset + 30 + nameSize + local.getUint16(28, true);
        if (start + entry.compressedSize > this.directoryOffset || (local.getUint16(6, true) & 1) !== 0)
            throw new EpubImportError(`EPUB 文件数据无效：${path}`);
        const metadata = new Uint8Array(await this.file.slice(entry.offset + 30, start).arrayBuffer());
        if (decodePath(metadata.subarray(0, nameSize)) !== path)
            throw new EpubImportError(`EPUB 文件路径不一致：${path}`);
        const extra = zip64Extra(new DataView(metadata.buffer), nameSize, metadata.byteLength);
        if (local.getUint32(18, true) === 0xffffffff || local.getUint32(22, true) === 0xffffffff) {
            if (!extra || extra.byteLength < 16) throw new EpubImportError(`EPUB ZIP64 文件头扩展字段不完整：${path}`);
            const size = extra.getBigUint64(0, true);
            const compressedSize = extra.getBigUint64(8, true);
            // 流式写入允许本地头暂填零；实际展开长度仍由中央目录和 CRC 确认。
            if (
                size > BigInt(MAX_ENTRY_BYTES) ||
                compressedSize > BigInt(this.file.size) ||
                (!(local.getUint16(6, true) & 8) &&
                    (size !== BigInt(entry.size) || compressedSize !== BigInt(entry.compressedSize)))
            )
                throw new EpubImportError(`EPUB ZIP64 文件头大小无效：${path}`);
        }

        const output = new Uint8Array(entry.size);
        let written = 0;
        let crc = 0xffffffff;
        /**
         * 每个输出块在复制前核对预算，伪造的 ZIP 展开长度不能越过限制。
         */
        const receive = (chunk: Uint8Array) => {
            if (written + chunk.length > output.length) throw new EpubImportError(`EPUB 展开长度与目录不符：${path}`);
            output.set(chunk, written);
            written += chunk.length;
            for (const byte of chunk) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
        };
        const inflater = entry.method === 8 ? new Inflate(receive) : undefined;
        for (let position = 0; position < entry.compressedSize || position === 0; position += INPUT_CHUNK_BYTES) {
            const end = Math.min(position + INPUT_CHUNK_BYTES, entry.compressedSize);
            const chunk = new Uint8Array(await this.file.slice(start + position, start + end).arrayBuffer());
            // 读取错误保留原貌；只有压缩数据处理失败属于可解释的格式拒绝。
            try {
                if (inflater) inflater.push(chunk, end === entry.compressedSize);
                else receive(chunk);
            } catch (error) {
                if (error instanceof EpubImportError) throw error;
                throw new EpubImportError(`EPUB 压缩数据已损坏：${path}`, { cause: error });
            }
        }
        if (written !== entry.size || (crc ^ 0xffffffff) >>> 0 !== entry.crc)
            throw new EpubImportError(`EPUB 文件校验失败：${path}`);
        return output;
    }
}
