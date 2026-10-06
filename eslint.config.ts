/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig, globalIgnores } from "eslint/config";
import base, { browser, node, typeChecked } from "@allurx/web-foundation/eslint";

export default defineConfig(
    globalIgnores(["dist/", ".vite/", ".wrangler/", ".certs/", "work/"]),
    base,

    // 页面与构建配置共享类型检查规则，文件范围由 Aura 维护。
    {
        files: ["src/**/*.ts", "*.ts"],
        extends: [typeChecked],
        languageOptions: {
            parserOptions: { tsconfigRootDir: import.meta.dirname },
        },
    },
    { files: ["src/**/*.ts"], extends: [browser] },
    { files: ["*.ts"], extends: [node] }
);
