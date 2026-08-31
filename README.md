# Aura

[Aura](https://aura.allurx.io) 是一个轻量级、原生实现的阅读器网页应用，支持书籍和文档在线阅读，界面简洁、交互流畅。

## 特性

- 📖 支持多种文本格式的阅读
- ⚡ 原生 HTML、CSS、JavaScript 实现，无框架依赖
- 🎨 简洁、现代化 UI，支持自定义主题
- 🔍 支持快速搜索、目录导航
- 🛠 可扩展，易于集成到其他网页或应用

## 注意

- 上传文件目前只支持txt格式，并且编码必须是UTF-8
- 目前aura还处于开发阶段，很多功能还不完善，甚至还有很多bug，等我有空了会慢慢完善的

## 本地开发

首次检出工程后，先安装满足 `package.json` 中 `engines.node` 要求的 Node.js，再安装锁定版本的依赖：

```bash
npm ci
```

`npm run dev` 使用 HTTPS，启动前需要在工程上级目录准备 `localhost-key.pem` 和 `localhost.pem`。

### 常用脚本

| 命令                     | 说明                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `npm run dev`            | 启动 Vite 开发服务器并打开浏览器。                                                 |
| `npm run format`         | 使用 Prettier 格式化源码和工程配置；该命令会直接修改文件。                         |
| `npm run check`          | 依次检查 Prettier 格式、ESLint 和 TypeScript 类型，不修改源码，也不生成构建产物。  |
| `npm run build`          | 先运行 `npm run check`，再将普通 Web 版本构建到 `dist`。                           |
| `npm run build:portable` | 先运行 `npm run check`，再将单文件 portable 版本构建到 `dist-portable/aura.html`。 |
| `npm run preview`        | 启动本地服务器预览普通 Web 构建产物。                                              |

### 定位问题与特殊构建

| 命令                                | 说明                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `npm run format:check`              | 只检查受管文件是否符合 Prettier 格式，不修改文件。                             |
| `npm run lint`                      | 只运行 ESLint。                                                                |
| `npm run type-check`                | 只运行 TypeScript 类型检查，不生成 JavaScript。                                |
| `npm run build:obfuscated`          | 先运行 `npm run check`，再将混淆的 Web 版本构建到 `dist`。                     |
| `npm run build:portable:obfuscated` | 先运行 `npm run check`，再将混淆的单文件版本构建到 `dist-portable/aura.html`。 |

混淆构建与对应的普通构建使用相同输出目录，后执行的构建会清空并替换前一次产物。
