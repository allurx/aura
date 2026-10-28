/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { Zip, ZipPassThrough } from "fflate";
import { assertExists } from "@/utils/assert-util";

// fflate 的 ZIP 写出使用 ZIP32；超过字段范围须在读取原文件前拒绝，避免下载损坏包。
const ZIP_MAX_ENTRIES = 65_535;
const ZIP_MAX_SIZE = 0xffff_ffff;
const ARCHIVE_NAME_MAX_BYTES = 255;
const READ_CHUNK_SIZE = 1024 * 1024;

/**
 * 已知的 ZIP 容量限制，可直接向用户说明如何缩小导出范围。
 */
export class BookExportError extends Error {
    /**
     * 保留可操作的导出限制说明，与未知读取或打包故障区分。
     */
    public constructor(message: string) {
        super(message);
        this.name = "BookExportError";
    }
}

/**
 * 将原始字节顺序装入不压缩的 ZIP；逐块读取以限制临时数组，并允许页面退出中止打包。
 * 同名或不安全文件名仅在包内消歧，所有条目均保留；完整下载 Blob 仍占用整包存储空间。
 */
export async function createBookArchive(
    files: readonly { name: string; source: Blob }[],
    reportProgress: (message: string) => void,
    signal: AbortSignal
): Promise<Blob> {
    signal.throwIfAborted();
    const names = createArchiveNames(files.map((file) => file.name));
    validateArchiveSize(files, names);

    // ZipPassThrough 同步产生数据；每块立即交给 Blob，避免同时保留全部原始数组。
    const parts: Blob[] = [];
    const archive = new Zip((error, data) => {
        if (error) throw error;
        parts.push(new Blob([data]));
    });
    let completedBytes = 0;
    const totalBytes = files.reduce((total, file) => total + file.source.size, 0);
    try {
        for (const [index, file] of files.entries()) {
            signal.throwIfAborted();
            const entry = new ZipPassThrough(assertExists(names[index]));
            archive.add(entry);
            let offset = 0;
            do {
                const end = Math.min(offset + READ_CHUNK_SIZE, file.source.size);
                const bytes = new Uint8Array(await file.source.slice(offset, end).arrayBuffer());
                signal.throwIfAborted();
                entry.push(bytes, end === file.source.size);
                completedBytes += end - offset;
                offset = end;
                const percent = totalBytes ? Math.floor((completedBytes / totalBytes) * 100) : 100;
                reportProgress(`正在打包 ${index + 1}/${files.length}（${percent}%）：${file.name}`);
                // 确保大量小文件或已驻留内存的 Blob 也能持续更新进度并响应生命周期退出。
                await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
            } while (offset < file.source.size);
        }
        signal.throwIfAborted();
        archive.end();
        return new Blob(parts, { type: "application/zip" });
    } finally {
        archive.terminate();
    }
}

/**
 * 为平面归档生成安全且不重复的文件名，避免路径穿越与常见文件系统的同名覆盖。
 */
function createArchiveNames(names: readonly string[]): string[] {
    const used = new Set<string>();
    const nextSuffix = new Map<string, number>();
    const encoder = new TextEncoder();
    return names.map((name) => {
        let safe =
            Array.from(name, (character) => {
                const code = character.charCodeAt(0);
                return code < 32 || code === 127 ? "_" : character;
            })
                .join("")
                .replace(/[\\/:*?"<>|]/g, "_")
                .replace(/[. ]+$/g, "") || "书籍";
        if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
        const extension = /\.(?:txt|epub)$/i.exec(safe)?.[0] ?? "";
        const stem = extension ? safe.slice(0, -extension.length) : safe;
        let candidate = fitArchiveName(stem, extension, encoder);
        const key = candidate.normalize("NFC").toLowerCase();
        let suffix = nextSuffix.get(key) ?? 2;
        while (used.has(candidate.normalize("NFC").toLowerCase())) {
            candidate = fitArchiveName(stem, ` (${suffix++})${extension}`, encoder);
        }
        nextSuffix.set(key, suffix);
        used.add(candidate.normalize("NFC").toLowerCase());
        return candidate;
    });
}

/**
 * 为扩展名与编号预留空间，按完整码点截短主文件名；UTF-8 字节上限也覆盖 UTF-16 长度上限。
 */
function fitArchiveName(stem: string, ending: string, encoder: TextEncoder): string {
    const budget = ARCHIVE_NAME_MAX_BYTES - encoder.encode(ending).length;
    let prefix = "";
    let length = 0;
    for (const character of stem) {
        const size = encoder.encode(character).length;
        if (length + size > budget) break;
        prefix += character;
        length += size;
    }
    return prefix + ending;
}

/**
 * 根据不压缩条目的确切头部与正文长度，检查 ZIP32 的文件数和偏移边界。
 */
function validateArchiveSize(files: readonly { source: Blob }[], names: readonly string[]): void {
    if (files.length > ZIP_MAX_ENTRIES) throw new BookExportError("一次最多导出 65,535 本书，请缩小范围。");
    const encoder = new TextEncoder();
    let size = 22;
    for (const [index, file] of files.entries()) {
        const nameLength = encoder.encode(assertExists(names[index])).length;
        // 本地文件头 30、数据描述符 16、中央目录 46；文件名在两个头部中各出现一次。
        size += file.source.size + 92 + nameLength * 2;
        if (size >= ZIP_MAX_SIZE) throw new BookExportError("导出包须小于 4 GiB，请缩小范围或逐本导出。");
    }
}
