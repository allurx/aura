/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * 为当前 Web 构建的版本化脚本和样式生成精确缓存规则，缺失资源继续使用 no-store。
 */
export function assetHeadersPlugin(): Plugin {
    return {
        name: "aura:asset-headers",
        apply: "build",
        generateBundle: {
            order: "post",
            /**
             * CSS 与代码分块生成后读取实际文件名，规则和对应资源一起参与本次交付。
             */
            handler(_options, bundle) {
                const template = readFileSync(new URL("./_headers", import.meta.url), "utf8").trimEnd();
                const files = Object.keys(bundle)
                    .filter((file) => file.startsWith("assets/") && /\.(?:js|css)$/.test(file))
                    .sort();

                // URL 规则中的通配符、占位符和空白会扩大匹配范围，不能视作精确文件名。
                if (files.some((file) => /[*:#?\s]/.test(file))) {
                    throw new Error("Generated asset paths cannot be represented as exact header rules");
                }

                const rules = files.map(
                    (file) => `/${file}\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable`
                );
                const source = [template, ...rules].join("\n\n") + "\n";

                // Cloudflare 超限时可能忽略规则；构建失败比发布部分生效的缓存配置更安全。
                const lines = source.split(/\r?\n/);
                const ruleCount = lines.filter((line) => /^[^\s#]/.test(line)).length;
                if (ruleCount > 100 || lines.some((line) => line.length > 2000)) {
                    throw new Error("Generated headers exceed Cloudflare's 100-rule or 2000-character line limit");
                }

                this.emitFile({ type: "asset", fileName: "_headers", source });
            },
        },
    };
}
