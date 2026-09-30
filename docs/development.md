# 开发指南

本文面向修改和验证 Aura 源码的开发者。站点操作见[部署指南](deployment.md)，分发新版本见[发布指南](releasing.md)；Agent 执行约束由根目录 [AGENTS.md](../AGENTS.md) 维护。

## 环境准备

Aura 使用原生 HTML、CSS、TypeScript，没有前端运行时框架。需要 Node.js 22.12.0 或更新版本及 npm；版本要求和脚本以 [package.json](../package.json) 为准，依赖由 `package-lock.json` 锁定。

在仓库根目录安装依赖：

```sh
npm ci
```

## 本地运行

开发服务器默认使用 HTTPS，并监听局域网。完成下面的一次性证书准备后，日常只需运行：

```sh
npm run dev
```

电脑访问 `https://localhost:5173/`，同一局域网的手机访问终端显示的 `Network` 地址，例如 `https://192.168.1.100:5173/`。示例 IP 需替换为开发电脑当前的局域网 IPv4 地址，可通过 `ipconfig` 查看；不要使用 VPN 或虚拟网卡地址。电脑与手机同时获得热更新，书籍与设置仍由各自浏览器独立保存。

端口固定为 5173；被占用时先停止旧开发服务器，再重新启动。手机与电脑需处于可互访的局域网，Windows 防火墙应允许 Node.js 在专用网络接收入站连接；访客 Wi-Fi 的设备隔离也可能阻止访问。

### 首次准备开发证书

按 [mkcert 官方说明](https://github.com/FiloSottile/mkcert#installation)安装工具，然后在仓库根目录生成证书，末尾的示例 IP 替换为开发电脑当前局域网地址；已有证书时先备份再重新生成：

```powershell
New-Item -ItemType Directory -Force .certs | Out-Null
mkcert -cert-file .certs/dev.pem -key-file .certs/dev-key.pem localhost 127.0.0.1 ::1 192.168.1.100
```

Windows 首次使用时，将 mkcert 生成的开发 CA 加入当前用户的受信任根证书，不修改整机或 Java 证书存储：

```powershell
$caDirectory = mkcert -CAROOT
certutil -user -addstore Root "$caDirectory/rootCA.pem"
```

[Vite 配置](../vite.config.ts)只在开发时读取工程内 `.certs/` 的这两个文件，该目录已由 Git 忽略，不放入 `src/public/`，构建和生产预览不依赖本机证书。局域网 IP 变化后重新签发包含新地址的证书并重启服务器；使用同一个开发 CA 时，无需在手机重复安装 CA。

iPhone 首次连接时，用 `mkcert -CAROOT` 找到 CA 目录，将其中的 `rootCA.pem` 传到自己的手机并安装描述文件，然后在“设置 → 通用 → 关于本机 → 证书信任设置”中开启对该开发 CA 的完全信任。具体步骤见 [mkcert 移动设备说明](https://github.com/FiloSottile/mkcert#mobile-devices)和 [Apple 证书信任说明](https://support.apple.com/zh-cn/102390)。仅传输 CA 公钥证书；CA 私钥 `rootCA-key.pem` 保留在 mkcert 用户目录，服务器私钥 `dev-key.pem` 留在工程的 `.certs/` 内，不传到手机或提交到仓库。

手机通过受信任的 HTTPS 页面验证导入、阅读和“添加到主屏幕”。普通局域网 HTTP 地址不具备安全上下文，无法运行 Aura 使用的 Web Crypto API。

## 从哪里读代码

[应用入口](../src/main.ts)把路由交给书架和阅读器，页面负责挂载与销毁，Controller 协调交互、业务操作和 UI：

- [书架](../src/pages/bookshelf/bookshelf-controller.ts)：导入、分类、搜索和删除；[书架业务](../src/pages/bookshelf/bookshelf-service.ts)负责去重共享正文与跨存储事务。[预设分类](../src/domain/category/category.ts)由代码维护，数据库只保存书籍的分类归属。
- [阅读器](../src/pages/reader/reader-controller.ts)：切章、恢复位置和保存进度；[阅读界面](../src/pages/reader/reader-ui.ts)统一按钮、键盘和[正文手势](../src/pages/reader/reading-gestures.ts)，负责响应式工具与浮层交互边界；[阅读业务](../src/pages/reader/reader-service.ts)读取章节并提交进度快照。
- [TXT 解析](../src/domain/chapter/chapter-parser.ts)：在写事务外解码和分章，保留全书物理行号；解析结果是普通数据记录。
- [数据访问](../src/database/store.ts)只包装当前需要的 IndexedDB 操作，[事务入口](../src/database/transaction.ts)等待整笔事务提交。界面不直接操作数据库。
- [外观设置](../src/settings/setting-controller.ts)独立管理主题、常规设置、预览和提交，使用两页各自的 `localStorage`，不进入书籍数据库。

例如导入一本书：Controller 接收文件并展示结果，书架业务先校验与解析，再在事务中写入共享正文、书籍和独立进度，最后刷新列表。阅读时只加载目录和当前章节。书籍与进度的数据形状由 `src/domain/` 中的类型维护，数据库结构以[建库代码](../src/database/database.ts)为准。

数据库名称保持不变，不提供旧结构迁移。改变持久化形状时，使用隔离的浏览器配置验证；若测试环境已有库与当前结构不兼容，可通过书架导航底部的“重置数据”清除 Aura 数据并重新加载，操作影响见[使用指南](usage.md#本地数据与-portable-注意事项)。不要为结构变更另起库名，也不要清理日常阅读数据。

## 许可声明维护

完整项目许可证维护在根目录 [LICENSE.txt](../LICENSE.txt)，实际分发的第三方许可与版权声明维护在 [THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt)。源码注释和版权头遵循 [AGENTS.md](../AGENTS.md#工程原则)；交付声明由构建生成，不直接编辑 `dist/` 中的副本。

新增、升级或移除进入产物的运行时依赖和第三方资源时，核对实际分发内容及其版本、许可证和版权归属，同步更新第三方声明。执行 `npm run verify` 后，核对两种 Web 产物中的声明文件与维护源一致，并在两种 portable 的“关于 Aura”中展开全文，确认声明完整、可离线查看，且交付仍为单个 HTML。

## 构建与预览

| 命令                                | 输出                                             |
| ----------------------------------- | ------------------------------------------------ |
| `npm run build`                     | `dist/web/`，普通 Web 版                         |
| `npm run build:obfuscated`          | `dist/web-obfuscated/`，混淆 Web 版              |
| `npm run build:portable`            | `dist/portable/aura.html`，普通离线版            |
| `npm run build:portable:obfuscated` | `dist/portable-obfuscated/aura.html`，混淆离线版 |

每个构建命令先执行静态检查，再只清理自身输出子目录，四种产物可以同时保留。Web 输出中的入口、资源、manifest、图标、`_headers`、`LICENSE.txt` 与 `THIRD-PARTY-NOTICES.txt` 属于同一次构建，应整体使用；portable 输出为单个 HTML 文件，许可声明已嵌入其中。

开发服务器与 Web 构建共用安装元信息和图标，可在本地 HTTPS 开发页或下面的 HTTP 预览中，从浏览器地址栏或菜单验证原生安装；portable 不包含安装元信息。安装交互与状态由浏览器管理，Web 安装不依赖 Service Worker，也不增加应用资源离线缓存。

构建对应版本后，选择一种预览方式：

```sh
# 普通 Web 版
npm run preview

# 混淆 Web 版
npm run preview -- --mode obfuscated
```

预览仅提供本地 HTTP 服务，不会部署站点。portable 直接通过浏览器打开对应 HTML，验证地址应为 `file://`。

## 检查与验证

| 命令                   | 用途                                 |
| ---------------------- | ------------------------------------ |
| `npm run format:check` | 只检查格式                           |
| `npm run lint`         | 检查 ESLint 规则                     |
| `npm run type-check`   | 检查 TypeScript 类型                 |
| `npm run check`        | 依次执行上述三项只读检查             |
| `npm run verify`       | 执行一次静态检查，再构建四种交付版本 |

`npm run format` 会改写 Prettier 支持且未被排除的文件，运行后应审查实际 diff。迭代时先运行与改动有关的检查，需要完整验证四种产物时执行 `npm run verify`。

构建不能代替运行时检查。页面交互变更应实际验证导航、关闭与取消、焦点和位置恢复、错误反馈及持久化；涉及 portable 时还需实际打开 `file://` 产物。只改文档时检查内容、链接、示例和格式，不运行无关构建。

[CI 工作流](../.github/workflows/ci.yml)验证所有 PR，以及 `dev`、`main` 的推送，并检查两个 Cloudflare 环境的部署 dry-run。在仓库 **Actions → CI** 查看对应提交的结果；站点是否已部署需另按[部署指南](deployment.md#自动部署与结果查看)核对。

## 分支协作

1. 在 `dev` 或以其为基线的任务分支开发，不在 `main` 上直接修改或推送。
2. 改动进入 `dev` 后，核对 CI 和预览站点。日常通过 `dev → main` PR 集成，检查最新提交、实际差异与验证结果。
3. 对长期分支 `dev → main` 使用 **Create a merge commit**，保留祖先关系。
4. 合并后按祖先关系将 `main` 同步回 `dev`：可快进时快进，分叉时普通合并，不重写历史或删除长期分支。同步前先确认目标 checkout 与本地修改状态。

提交使用 Conventional Commits；`scope` 可选，仅用于明确的产品或技术边界，跨多个边界时省略。

### 仓库保护配置

仓库管理员在 **Settings → Rules → Rulesets → New ruleset → New branch ruleset** 配置 `main` 保护，确认状态为 **Active**、目标为 `main`：要求通过 PR 和 GitHub Actions 的 `verify`，以最新 `main` 验证，并禁止强推和删除。允许 merge commit，不启用线性历史要求；单人项目不强制取得他人 approval。

私有仓库的规则支持取决于 GitHub 套餐，见 [rulesets 可用范围](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)。本地约定或 CI 成功不代表服务器端保护已经启用。

### Actions 依赖更新

Actions 使用完整 commit SHA 固定，并保留同一行版本注释。[Dependabot 配置](../.github/dependabot.yml)由默认分支 `main` 提供，每周向 `dev` 提交 Actions 更新 PR。维护者核对更新、运行验证并审核后合并，再随开发成果集成到 `main`。
