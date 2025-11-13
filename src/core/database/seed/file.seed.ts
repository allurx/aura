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

/**
 * 文件数据种子
 * @author allurx
 */
export default class FileSeed {
    private static readonly text = `
        1. Aura是什么
        Aura是一个轻量级、原生实现的阅读器网页应用,支持书籍和文档在线阅读,界面简洁、交互流畅。
        📖 支持多种文本格式的阅读
        ⚡ 原生HTML、CSS、TypeScript实现
        🎨 简洁、现代化UI,支持自定义主题
        🔍 支持快速搜索、目录导航
        🛠 可扩展,易于集成到其他网页或应用
        📁 上传文件目前只支持txt格式,并且编码必须是UTF-8
        🔒 目前Aura还处于早期开发阶段,很多功能还不完善,甚至还有很多bug,等我有空了会慢慢完善的
    `;

    public static readonly file = new File([this.text], "Aura.txt", { type: "text/plain" });
}
