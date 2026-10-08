/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer, File } from "node:buffer";
import { strToU8, zipSync } from "fflate";

/**
 * 生成单正文 EPUB 3；输入由测试用例提供，原字节可用于公开导入和导出的完整对照。
 */
export function createEpubFixture(body: string): Buffer {
    const xml = (title: string, content: string): string =>
        `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body>${content}</body></html>`;
    const entries = {
        mimetype: strToU8("application/epub+zip"),
        "META-INF/container.xml": strToU8(
            '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
        ),
        "OEBPS/package.opf": strToU8(
            '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:aura:test:epub</dc:identifier><dc:title>Aura EPUB regression fixture</dc:title><dc:language>zh-CN</dc:language><meta property="dcterms:modified">2026-10-08T00:00:00Z</meta></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="pixel" href="pixel.png" media-type="image/png"/></manifest><spine><itemref idref="chapter"/></spine></package>'
        ),
        "OEBPS/pixel.png": Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
            "base64"
        ),
        "OEBPS/chapter.xhtml": strToU8(xml("正文", body)),
        "OEBPS/nav.xhtml": strToU8(
            xml(
                "目录",
                '<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol><li><a href="chapter.xhtml">正文</a></li></ol></nav>'
            )
        ),
    };
    // 使用固定的 ZIP 时间，重复生成同一用例时原字节一致。
    return Buffer.from(zipSync(entries, { level: 0, mtime: new Date(2026, 9, 8) }));
}

/**
 * 超出既定 256 MiB 预算的受控输入；任何读取都会失败，避免为了验证前置拒绝实际分配大文件。
 */
export function createOversizedEpubFile() {
    return new (class extends File {
        public override readonly size = 257 * 1024 * 1024;
        public readonly webkitRelativePath = "";

        public override arrayBuffer(): never {
            throw new Error("Oversized EPUB must be rejected before arrayBuffer");
        }

        public override bytes(): never {
            throw new Error("Oversized EPUB must be rejected before bytes");
        }

        public override slice(): never {
            throw new Error("Oversized EPUB must be rejected before slice");
        }

        public override stream(): never {
            throw new Error("Oversized EPUB must be rejected before stream");
        }
    })([], "oversized.epub");
}
