/*
 * Copyright 2025 allurx
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// 内置手册内容版本，用于判断是否需要更新已导入的手册。
export const HANDBOOK_VERSION = 1;

const handbookText = `
        1. Aura是什么
        Aura是一个轻量级、原生实现的阅读器网页应用,支持书籍和文档在线阅读,界面简洁、交互流畅。
        📖 支持多种文本格式的阅读
        ⚡ 原生HTML、CSS、TypeScript实现
        🎨 简洁、现代化UI,支持自定义主题
        🔍 支持快速搜索、目录导航
        🛠 可扩展,易于集成到其他网页或应用
        📁 上传文件目前只支持txt格式,支持自动识别UTF-8、GB18030、Big5和带BOM的UTF-16编码
        🔒 目前Aura还处于早期开发阶段,很多功能还不完善,甚至还有很多bug,等我有空了会慢慢完善的
        2. QQ交流群
        欢迎加入Aura交流群讨论和交流: 1038423789
    `.trim();

/**
 * 创建内置 Aura 手册文件。
 * @returns 内置手册文件
 */
export function createHandbookFile(): File {
    return new File([handbookText], "Aura.txt", { type: "text/plain" });
}
