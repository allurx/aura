# Aura

[Aura](https://aura.allurx.io) 是一个轻量级、原生实现的阅读器网页应用，支持书籍和文档在线阅读，界面简洁、交互流畅。

## 特性

- 📖 支持多种文本格式的阅读
- ⚡ 原生 HTML、CSS、JavaScript 实现，无框架依赖
- 🎨 简洁、现代化 UI，支持自定义主题
- 🔍 支持快速搜索、目录导航
- 🛠 可扩展，易于集成到其他网页或应用

## 本地构建

使用 Node.js 22.12.0 或更新版本，在仓库根目录运行 `npm ci`，然后选择构建命令：

| 命令                                | 输出                                             |
| ----------------------------------- | ------------------------------------------------ |
| `npm run build`                     | `dist/web/`，普通 Web 版                         |
| `npm run build:obfuscated`          | `dist/web-obfuscated/`，混淆 Web 版              |
| `npm run build:portable`            | `dist/portable/aura.html`，普通离线版            |
| `npm run build:portable:obfuscated` | `dist/portable-obfuscated/aura.html`，混淆离线版 |

四种构建使用 `dist/` 下各自的子目录，只清理对应子目录，产物可以同时保留。构建后，使用 `npm run preview` 预览普通 Web 版，或使用 `npm run preview -- --mode obfuscated` 预览混淆 Web 版；离线版直接打开对应 HTML 文件。

`npm run verify` 执行一次静态检查，并构建验证上述四种版本。预览站点和正式站点均部署混淆 Web 版。

## 下载与发布

正式版本可从 [GitHub Releases](https://github.com/allurx/aura/releases) 下载：

- `aura-web-vX.Y.Z.zip` 是普通 Web 部署包，解压后将根目录内容部署到 HTTP(S) 站点根路径。
- `aura-portable-vX.Y.Z.html` 是可直接以 `file://` 打开的单文件离线版。
- `aura-vX.Y.Z-SHA256SUMS.txt` 包含上述两个构建产物的 SHA-256 校验值。

正式发布由位于 `main` 历史上的 annotated `vX.Y.Z` tag 触发。发布流程会对该 tag 重新执行完整验证，随后自动创建 GitHub Release 并上传产物。GitHub 自动生成的源码 ZIP/TAR 不是 Aura 构建产物。

Cloudflare Workers 静态托管的准备、部署与回滚见[部署指南](docs/deployment.md)。

## 注意

- 上传文件目前只支持txt格式，支持自动识别UTF-8、GB18030、Big5和带BOM的UTF-16编码
- 目前aura还处于开发阶段，很多功能还不完善，甚至还有很多bug，等我有空了会慢慢完善的
