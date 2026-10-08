/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { Inflate } from "fflate";
import { getEpubSizeRejection } from "./epub-limits";

// 按浏览器中的单本书预算限制归档规模，避免恶意目录或高度压缩内容耗尽内存。
const MAX_ENTRIES = 10_000;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
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
        const sizeRejection = getEpubSizeRejection(file.size);
        if (sizeRejection) throw new EpubImportError(sizeRejection);
        const tailOffset = Math.max(0, file.size - 65_557);
        const tail = new DataView(await file.slice(tailOffset).arrayBuffer());
        let end = tail.byteLength - 22;
        while (end >= 0) {
            if (
                tail.getUint32(end, true) === 0x06054b50 &&
                end + 22 + tail.getUint16(end + 20, true) === tail.byteLength
            )
                break;
            end--;
        }
        if (end < 0) throw new EpubImportError("文件不是完整的 EPUB ZIP 归档。");

        const count = tail.getUint16(end + 10, true);
        const directorySize = tail.getUint32(end + 12, true);
        const directoryOffset = tail.getUint32(end + 16, true);
        if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff)
            throw new EpubImportError("暂不支持 ZIP64 格式的 EPUB。");
        if (tail.getUint16(end + 4, true) !== 0 || tail.getUint16(end + 6, true) !== 0)
            throw new EpubImportError("不支持分卷 EPUB 归档。");
        if (count !== tail.getUint16(end + 8, true) || directoryOffset + directorySize > tailOffset + end)
            throw new EpubImportError("EPUB 归档目录已损坏。");
        if (count > MAX_ENTRIES || directorySize > 16 * 1024 * 1024)
            throw new EpubImportError("EPUB 归档目录过大，最多支持 10,000 个文件。");

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
            const entryEnd =
                cursor +
                46 +
                nameSize +
                directory.getUint16(cursor + 30, true) +
                directory.getUint16(cursor + 32, true);
            if (entryEnd > directory.byteLength) throw new EpubImportError("EPUB 归档目录不完整。");
            const path = decodePath(new Uint8Array(directory.buffer, cursor + 46, nameSize));
            const entry: ZipEntry = {
                path,
                flags: directory.getUint16(cursor + 8, true),
                method: directory.getUint16(cursor + 10, true),
                crc: directory.getUint32(cursor + 16, true),
                compressedSize: directory.getUint32(cursor + 20, true),
                size: directory.getUint32(cursor + 24, true),
                offset: directory.getUint32(cursor + 42, true),
            };
            totalSize += entry.size;
            if (entry.flags & 1) throw new EpubImportError("不支持加密或需要密码的 EPUB。");
            if (entry.size > MAX_ENTRY_BYTES || totalSize > MAX_TOTAL_BYTES)
                throw new EpubImportError("EPUB 展开后过大：单个文件最多 64 MiB，全书最多 512 MiB。");
            if (entry.offset + 30 + entry.compressedSize > directoryOffset)
                throw new EpubImportError("EPUB 归档中的文件位置无效。");
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
        const localName = new Uint8Array(
            await this.file.slice(entry.offset + 30, entry.offset + 30 + nameSize).arrayBuffer()
        );
        if (decodePath(localName) !== path) throw new EpubImportError(`EPUB 文件路径不一致：${path}`);

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
