/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Plugin } from "vite";

/**
 * 在生成文件前重命名 portable 入口，让后续许可校验使用最终文件名。
 */
export function portableEntryPlugin(): Plugin {
    return {
        name: "aura:portable-entry",
        apply: "build",
        generateBundle: {
            order: "post",
            /**
             * 内联完成后将标准 HTML 入口替换为便携版文件名。
             */
            handler(_options, bundle) {
                const entry = bundle["index.html"];
                if (entry?.type !== "asset") throw new Error("Portable HTML entry was not generated");

                delete bundle["index.html"];
                this.emitFile({ type: "asset", fileName: "aura.html", source: entry.source });
            },
        },
    };
}
