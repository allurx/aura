/*
 * Copyright 2025 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

/**
 * ESLint configuration with TypeScript support.
 * @see https://typescript-eslint.io/
 */
export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
        files: ["src/**/*.ts", "*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // DOM 模板和事件入口允许调用方明确指定元素、事件类型。
            "@typescript-eslint/no-unnecessary-type-parameters": "off",
            // Keep type-only dependencies out of the runtime module graph
            "@typescript-eslint/consistent-type-imports": [
                "error",
                {
                    prefer: "type-imports",
                    fixStyle: "separate-type-imports",
                },
            ],
            "@typescript-eslint/no-import-type-side-effects": "error",
        },
    }
);
