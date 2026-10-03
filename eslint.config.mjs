/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
    globalIgnores(["dist/", "node_modules/", ".vite/", ".wrangler/", ".certs/", "work/"]),
    eslint.configs.recommended,
    {
        files: ["**/*.ts"],
        extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // 数值插值用于界面计数、尺寸和生成标记，保留 JavaScript 的直接转换语义。
            "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            // DOM 模板和事件入口允许调用方明确指定元素、事件类型。
            "@typescript-eslint/no-unnecessary-type-parameters": "off",
            // 类型依赖不进入运行时模块关系，避免仅导入类型也保留模块副作用。
            "@typescript-eslint/consistent-type-imports": [
                "error",
                {
                    prefer: "type-imports",
                    fixStyle: "separate-type-imports",
                },
            ],
            "@typescript-eslint/no-import-type-side-effects": "error",
        },
    },
    {
        files: ["scripts/**/*.ts", "*.ts", "*.mjs"],
        rules: {
            // 第三方声明可能间接引入 DOM 类型，Node.js 构建代码仍不能使用页面 API。
            "no-restricted-globals": [
                "error",
                {
                    globals: [
                        "window",
                        "document",
                        "HTMLElement",
                        "Element",
                        "customElements",
                        "location",
                        "history",
                        "localStorage",
                        "sessionStorage",
                        "matchMedia",
                        "getComputedStyle",
                        "requestAnimationFrame",
                        "cancelAnimationFrame",
                    ],
                    checkGlobalObject: true,
                },
            ],
        },
    }
);
