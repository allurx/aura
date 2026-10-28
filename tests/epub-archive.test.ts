/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";
import { strToU8, zipSync } from "fflate";
import { build } from "vite";
import type * as ArchiveModule from "../src/domain/file/epub-archive.ts";

type Zip64Field = "size" | "compressedSize" | "offset" | "disk";

interface FixtureEntry {
    path: string;
    content: string;
    fields?: readonly Zip64Field[];
    localZip64?: boolean;
    compressed?: boolean;
    descriptor?: boolean;
}

let archiveModule: typeof ArchiveModule;
let moduleDirectory: string | undefined;
let modulePath: string | undefined;

/**
 * 打包实际归档入口，在 Node 中验证 File API，不复制生产解析器。
 */
before(async () => {
    const result = await build({
        configFile: false,
        logLevel: "silent",
        ssr: { noExternal: true },
        build: {
            ssr: resolve(import.meta.dirname, "../src/domain/file/epub-archive.ts"),
            write: false,
            minify: false,
        },
    });
    assert.ok(!Array.isArray(result) && "output" in result);
    const entry = result.output.find((output) => output.type === "chunk" && output.isEntry);
    assert.ok(entry?.type === "chunk");
    moduleDirectory = await mkdtemp(join(tmpdir(), "aura-archive-test-"));
    modulePath = join(moduleDirectory, "epub-archive.mjs");
    await writeFile(modulePath, entry.code);
    const module: unknown = await import(pathToFileURL(modulePath).href);
    assert.ok(module && typeof module === "object" && "EpubArchive" in module && "EpubImportError" in module);
    archiveModule = module as typeof ArchiveModule;
});

after(async () => {
    if (modulePath) await unlink(modulePath);
    if (moduleDirectory) await rmdir(moduleDirectory);
});

/**
 * 生成微型归档：压缩流与 CRC 由 fflate 提供，ZIP64 元数据按格式独立构造。
 * 返回记录位置供畸形输入用例修改声明，不分配声明中的大文件。
 */
function createArchive(
    entries: readonly FixtureEntry[],
    { zip64End = true, sentinelEnd = true, commentLength = 0 } = {}
) {
    const localRecords: Buffer[] = [];
    const centralRecords: Buffer[] = [];
    const localOffsets: number[] = [];
    const centralOffsets: number[] = [];
    let localOffset = 0;
    let centralSize = 0;
    for (const entry of entries) {
        const fields = entry.fields ?? [];
        const name = Buffer.from(entry.path);
        const content = strToU8(entry.content);
        const ordinary = Buffer.from(
            zipSync({ [entry.path]: content }, { level: entry.compressed ? 6 : 0, mtime: new Date(2026, 9, 28) })
        );
        const payloadStart = 30 + ordinary.readUInt16LE(26) + ordinary.readUInt16LE(28);
        const payload = ordinary.subarray(payloadStart, payloadStart + ordinary.readUInt32LE(18));
        const crc = ordinary.readUInt32LE(14);
        const flags = 0x800 | (entry.descriptor ? 8 : 0);

        const localExtra = Buffer.alloc(entry.localZip64 ? 20 : 0);
        if (entry.localZip64) {
            localExtra.writeUInt16LE(1, 0);
            localExtra.writeUInt16LE(16, 2);
            localExtra.writeBigUInt64LE(BigInt(entry.descriptor ? 0 : content.length), 4);
            localExtra.writeBigUInt64LE(BigInt(entry.descriptor ? 0 : payload.length), 12);
        }
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(entry.localZip64 ? 45 : 20, 4);
        local.writeUInt16LE(flags, 6);
        local.writeUInt16LE(entry.compressed ? 8 : 0, 8);
        local.writeUInt32LE(entry.descriptor ? 0 : crc, 14);
        local.writeUInt32LE(entry.localZip64 ? 0xffffffff : entry.descriptor ? 0 : payload.length, 18);
        local.writeUInt32LE(entry.localZip64 ? 0xffffffff : entry.descriptor ? 0 : content.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(localExtra.length, 28);
        const descriptor = Buffer.alloc(entry.descriptor ? (entry.localZip64 ? 24 : 16) : 0);
        if (entry.descriptor) {
            descriptor.writeUInt32LE(0x08074b50, 0);
            descriptor.writeUInt32LE(crc, 4);
            if (entry.localZip64) {
                descriptor.writeBigUInt64LE(BigInt(payload.length), 8);
                descriptor.writeBigUInt64LE(BigInt(content.length), 16);
            } else {
                descriptor.writeUInt32LE(payload.length, 8);
                descriptor.writeUInt32LE(content.length, 12);
            }
        }
        const localRecord = Buffer.concat([local, name, localExtra, payload, descriptor]);
        localOffsets.push(localOffset);
        localRecords.push(localRecord);

        const extraValues: Buffer[] = [];
        const values: Record<Zip64Field, number> = {
            size: content.length,
            compressedSize: payload.length,
            offset: localOffset,
            disk: 0,
        };
        for (const field of ["size", "compressedSize", "offset", "disk"] as const) {
            if (!fields.includes(field)) continue;
            const value = Buffer.alloc(field === "disk" ? 4 : 8);
            if (field === "disk") value.writeUInt32LE(values[field]);
            else value.writeBigUInt64LE(BigInt(values[field]));
            extraValues.push(value);
        }
        const extraData = Buffer.concat(extraValues);
        const extra = Buffer.alloc(extraData.length ? extraData.length + 4 : 0);
        if (extraData.length) {
            extra.writeUInt16LE(1, 0);
            extra.writeUInt16LE(extraData.length, 2);
            extraData.copy(extra, 4);
        }
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(fields.length ? 45 : 20, 6);
        central.writeUInt16LE(flags, 8);
        central.writeUInt16LE(entry.compressed ? 8 : 0, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(fields.includes("compressedSize") ? 0xffffffff : payload.length, 20);
        central.writeUInt32LE(fields.includes("size") ? 0xffffffff : content.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(extra.length, 30);
        central.writeUInt16LE(fields.includes("disk") ? 0xffff : 0, 34);
        central.writeUInt32LE(fields.includes("offset") ? 0xffffffff : localOffset, 42);
        const centralRecord = Buffer.concat([central, name, extra]);
        centralOffsets.push(centralSize);
        centralRecords.push(centralRecord);
        localOffset += localRecord.length;
        centralSize += centralRecord.length;
    }

    const directoryOffset = localOffset;
    const recordOffset = directoryOffset + centralSize;
    const zip64 = Buffer.alloc(zip64End ? 56 : 0);
    const locator = Buffer.alloc(zip64End ? 20 : 0);
    if (zip64End) {
        zip64.writeUInt32LE(0x06064b50, 0);
        zip64.writeBigUInt64LE(44n, 4);
        zip64.writeUInt16LE(45, 12);
        zip64.writeUInt16LE(45, 14);
        zip64.writeBigUInt64LE(BigInt(entries.length), 24);
        zip64.writeBigUInt64LE(BigInt(entries.length), 32);
        zip64.writeBigUInt64LE(BigInt(centralSize), 40);
        zip64.writeBigUInt64LE(BigInt(directoryOffset), 48);
        locator.writeUInt32LE(0x07064b50, 0);
        locator.writeBigUInt64LE(BigInt(recordOffset), 8);
        locator.writeUInt32LE(1, 16);
    }
    const endOffset = recordOffset + zip64.length + locator.length;
    const end = Buffer.alloc(22 + commentLength);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(zip64End && sentinelEnd ? 0xffff : entries.length, 8);
    end.writeUInt16LE(zip64End && sentinelEnd ? 0xffff : entries.length, 10);
    end.writeUInt32LE(zip64End && sentinelEnd ? 0xffffffff : centralSize, 12);
    end.writeUInt32LE(zip64End && sentinelEnd ? 0xffffffff : directoryOffset, 16);
    end.writeUInt16LE(commentLength, 20);
    return {
        bytes: Buffer.concat([...localRecords, ...centralRecords, zip64, locator, end]),
        localOffsets,
        centralOffsets: centralOffsets.map((offset) => offset + directoryOffset),
        directoryOffset,
        recordOffset,
        locatorOffset: recordOffset + zip64.length,
        endOffset,
    };
}

const body: FixtureEntry = { path: "chapter.xhtml", content: "<p>正文与 original bytes</p>" };
const zip64Body: FixtureEntry = {
    ...body,
    fields: ["size", "compressedSize", "offset", "disk"],
    localZip64: true,
};

/**
 * 经公开入口读取原始内容，支持带 ZIP64 尾部、仅条目扩展及普通条目混合的归档。
 */
async function verifyArchive(entries: readonly FixtureEntry[], options = {}) {
    const fixture = createArchive(entries, options);
    const archive = await archiveModule.EpubArchive.open(new File([Uint8Array.from(fixture.bytes)], "fixture.epub"));
    for (const entry of entries) {
        assert.equal(archive.has(entry.path), true);
        assert.deepEqual(await archive.read(entry.path), strToU8(entry.content));
    }
}

void test("ordinary and mixed ZIP64 archives preserve stored and deflated resource bytes", async () => {
    await verifyArchive([body], { zip64End: false });
    await verifyArchive([{ ...body, compressed: true, descriptor: true }], { zip64End: false });
    await verifyArchive([body]);
    await verifyArchive([zip64Body], { sentinelEnd: false });
    await verifyArchive([zip64Body], { zip64End: false });
    await verifyArchive([zip64Body], { commentLength: 65_535 });
    await verifyArchive([
        { path: "mimetype", content: "application/epub+zip" },
        { ...zip64Body, compressed: true, descriptor: true },
        { ...body, path: "offset-only.xhtml", fields: ["offset"] },
        { ...body, path: "sizes-only.xhtml", fields: ["size", "compressedSize"], compressed: true },
    ]);
});

/**
 * 验证格式拒绝的错误类型；按需进入资源读取，以覆盖本地头与数据校验。
 */
async function expectRejection(fixture: ReturnType<typeof createArchive>, message: RegExp, read = false) {
    await assert.rejects(
        async () => {
            const archive = await archiveModule.EpubArchive.open(
                new File([Uint8Array.from(fixture.bytes)], "bad.epub")
            );
            if (read) await archive.read(body.path);
        },
        (error: unknown) => error instanceof archiveModule.EpubImportError && message.test(error.message)
    );
}

void test("ZIP64 tail rejects absent, truncated, inconsistent and out-of-range records", async () => {
    const missing = createArchive([zip64Body]);
    missing.bytes.writeUInt32LE(0, missing.locatorOffset);
    await expectRejection(missing, /缺少 ZIP64/);

    for (const value of [1n, 2n ** 63n]) {
        const truncated = createArchive([zip64Body]);
        truncated.bytes.writeBigUInt64LE(value, truncated.recordOffset + 4);
        await expectRejection(truncated, /目录记录不完整/);
    }
    const outside = createArchive([zip64Body]);
    outside.bytes.writeBigUInt64LE(2n ** 63n, outside.locatorOffset + 8);
    await expectRejection(outside, /目录位置无效/);
    const inconsistent = createArchive([zip64Body], { sentinelEnd: false });
    inconsistent.bytes.writeUInt32LE(0, inconsistent.endOffset + 16);
    await expectRejection(inconsistent, /声明不一致/);
    const directoryOutside = createArchive([zip64Body]);
    directoryOutside.bytes.writeBigUInt64LE(2n ** 63n, directoryOutside.recordOffset + 48);
    await expectRejection(directoryOutside, /归档目录已损坏/);
});

void test("ZIP64 entry extensions reject missing fields, truncated fields and unsafe sizes or offsets", async () => {
    const missing = createArchive([zip64Body]);
    const extraOffset = missing.directoryOffset + 46 + Buffer.byteLength(body.path);
    missing.bytes.writeUInt16LE(2, extraOffset);
    await expectRejection(missing, /扩展字段缺失或不完整/);
    const truncated = createArchive([zip64Body]);
    truncated.bytes.writeUInt16LE(7, extraOffset + 2);
    await expectRejection(truncated, /扩展字段/);
    const overflow = createArchive([zip64Body]);
    overflow.bytes.writeUInt16LE(65_535, extraOffset + 2);
    await expectRejection(overflow, /扩展字段不完整/);

    for (const [position, expected] of [
        [0, /展开后过大/],
        [8, /文件位置无效/],
        [16, /文件位置无效/],
    ] as const) {
        const huge = createArchive([zip64Body]);
        huge.bytes.writeBigUInt64LE(2n ** 63n, extraOffset + 4 + position);
        await expectRejection(huge, expected);
    }
    const local = createArchive([zip64Body]);
    local.bytes.writeUInt16LE(2, 30 + Buffer.byteLength(body.path));
    await expectRejection(local, /文件头扩展字段不完整/, true);
    const localSize = createArchive([zip64Body]);
    localSize.bytes.writeBigUInt64LE(2n ** 63n, 34 + Buffer.byteLength(body.path));
    await expectRejection(localSize, /文件头大小无效/, true);
});

void test("ZIP64 keeps per-file, directory, entry-count and total-expanded budgets", async () => {
    const entryLimit = createArchive([zip64Body]);
    entryLimit.bytes.writeBigUInt64LE(
        BigInt(64 * 1024 * 1024 + 1),
        entryLimit.directoryOffset + 50 + Buffer.byteLength(body.path)
    );
    await expectRejection(entryLimit, /单个文件最多 64 MiB/);
    const directoryLimit = createArchive([body]);
    directoryLimit.bytes.writeBigUInt64LE(BigInt(16 * 1024 * 1024 + 1), directoryLimit.recordOffset + 40);
    await expectRejection(directoryLimit, /目录超过 16 MiB/);
    const countLimit = createArchive([body]);
    countLimit.bytes.writeBigUInt64LE(10_001n, countLimit.recordOffset + 24);
    countLimit.bytes.writeBigUInt64LE(10_001n, countLimit.recordOffset + 32);
    await expectRejection(countLimit, /最多支持 10,000/);

    const entries = Array.from({ length: 9 }, (_, index) => ({ ...zip64Body, path: `chapter-${String(index)}.xhtml` }));
    const totalLimit = createArchive(entries);
    for (const [index, offset] of totalLimit.centralOffsets.entries()) {
        const entry = entries[index];
        assert.ok(entry);
        totalLimit.bytes.writeBigUInt64LE(BigInt(64 * 1024 * 1024), offset + 50 + Buffer.byteLength(entry.path));
    }
    await expectRejection(totalLimit, /全书最多 512 MiB/);
});

void test("ordinary and ZIP64 archives reject multi-volume, encryption, unsafe paths and corrupted data", async () => {
    for (const [offset, width] of [
        ["locator", 4],
        ["record", 16],
        ["record", 20],
    ] as const) {
        const fixture = createArchive([zip64Body]);
        fixture.bytes.writeUInt32LE(1, (offset === "locator" ? fixture.locatorOffset : fixture.recordOffset) + width);
        await expectRejection(fixture, /分卷/);
    }
    const disk = createArchive([zip64Body]);
    disk.bytes.writeUInt32LE(1, disk.directoryOffset + 50 + Buffer.byteLength(body.path) + 24);
    await expectRejection(disk, /分卷/);
    const ordinaryDisk = createArchive([body], { zip64End: false });
    ordinaryDisk.bytes.writeUInt16LE(1, ordinaryDisk.directoryOffset + 34);
    await expectRejection(ordinaryDisk, /分卷/);

    const encrypted = createArchive([zip64Body]);
    encrypted.bytes.writeUInt16LE(1, encrypted.directoryOffset + 8);
    await expectRejection(encrypted, /加密/);
    const unsupported = createArchive([zip64Body]);
    unsupported.bytes.writeUInt16LE(99, unsupported.directoryOffset + 10);
    await expectRejection(unsupported, /不支持的压缩方式/, true);
    await expectRejection(createArchive([{ ...zip64Body, path: "../chapter.xhtml" }]), /无效的书内文件路径/);
    await expectRejection(createArchive([zip64Body, zip64Body]), /重复的书内路径/);
    const corrupted = createArchive([zip64Body]);
    corrupted.bytes[30 + Buffer.byteLength(body.path) + 20] = 0;
    await expectRejection(corrupted, /文件校验失败/, true);
});
