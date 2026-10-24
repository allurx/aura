/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * 许可维护源只保存一份；所有页面内嵌全文，Web 另提供随产物分发的文本文件。
 */
export function licensePlugin(projectRoot: string, portable: boolean): Plugin {
    const documents = [
        { fileName: "LICENSE.txt", placeholder: "__AURA_LICENSE_TEXT__" },
        { fileName: "THIRD-PARTY-NOTICES.txt", placeholder: "__AURA_THIRD_PARTY_NOTICES__" },
    ].map((document) => {
        const text = readFileSync(resolve(projectRoot, document.fileName), "utf8");
        if (!text.trim()) throw new Error(`License document is empty: ${document.fileName}`);
        const thirdParty = document.fileName === "THIRD-PARTY-NOTICES.txt";
        const parts = thirdParty ? text.split(/(?=^--- .+ ---\r?$)/m) : [text];
        return {
            ...document,
            text,
            parts: parts.map(escapeHtml),
            html: thirdParty ? renderThirdPartyLicenses(parts) : escapeHtml(text),
        };
    });

    return {
        name: "aura:licenses",
        transformIndexHtml: {
            order: "pre",
            /**
             * 开发页和生产构建使用相同许可正文。
             */
            handler(html) {
                for (const document of documents) {
                    if (!html.includes(document.placeholder)) {
                        throw new Error(`License placeholder is missing: ${document.fileName}`);
                    }
                    html = html.replace(document.placeholder, () => document.html);
                }
                return html;
            },
        },
        generateBundle: {
            order: "post",
            /**
             * 内联结束后核对全文，避免构建成功却遗漏许可；portable 不产生伴随文件。
             */
            handler(_options, bundle) {
                const entry = bundle[portable ? "aura.html" : "index.html"];
                if (entry?.type !== "asset") throw new Error("Licensed HTML entry was not generated");
                const html = typeof entry.source === "string" ? entry.source : new TextDecoder().decode(entry.source);
                for (const document of documents) {
                    if (!document.parts.every((part) => html.includes(part))) {
                        throw new Error(`Built HTML is missing license text: ${document.fileName}`);
                    }
                    if (!portable) this.emitFile({ type: "asset", fileName: document.fileName, source: document.text });
                }
            },
        },
    };
}

/**
 * 从同一份声明生成名称、版本和来源概览；每段原文只嵌入一次，按需展开。
 */
function renderThirdPartyLicenses(parts: string[]): string {
    const [preamble, ...components] = parts;
    if (preamble === undefined || components.length === 0) throw new Error("Third-party notice sections are missing");

    const items = components.map((text) => {
        const heading = /^--- (.+?) ---\r?$/m.exec(text)?.[1];
        const versioned = heading ? /^(.+?) (\d+\.\d+\.\d+)(?: .*)?$/.exec(heading) : null;
        const source = /^Source: (https:\/\/\S+)\r?$/m.exec(text)?.[1];
        const license = /^License: ([\w.-]+)\r?$/m.exec(text)?.[1];
        const name = versioned?.[1] ?? heading;
        const version = versioned?.[2];
        if (!name || !source || !license) throw new Error("Third-party notice metadata is incomplete");

        // 独立图标等资源按固定来源标识，不为适配组件列表虚构软件版本号。
        const label = version ? `${name} ${version}` : name;
        const sourceUrl = new URL(source).href;
        return `<li class="license-item">
            <details class="license-disclosure">
                <summary aria-label="查看 ${escapeHtml(label)} 的版权与许可（${escapeHtml(license)}）">
                    <span class="icon icon-chevron" aria-hidden="true"></span>
                    <span class="license-item-heading"><span>${escapeHtml(name)}</span>${version ? `<span class="license-version">${escapeHtml(version)}</span>` : ""}</span>
                    <span class="license-badge">${escapeHtml(license)}</span>
                </summary>
                <div class="license-document">
                    <pre data-notice-part>${escapeHtml(text)}</pre>
                </div>
            </details>
            <a class="license-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="查看 ${escapeHtml(label)} 项目来源（新窗口）" title="查看项目来源">
                <span class="icon icon-external-link" aria-hidden="true"></span>
            </a>
        </li>`;
    });

    return `<pre data-notice-part hidden>${escapeHtml(preamble)}</pre><ul class="license-list">${items.join("")}</ul>`;
}

/**
 * 声明原文和来源字段只作为文本或属性值使用，不允许成为 HTML 结构。
 */
function escapeHtml(text: string): string {
    return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
