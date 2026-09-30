# 开发指南

本文说明如何运行、修改和验证 Aura。部署在线站点见[部署指南](deployment.md)，发布下载文件见[发布指南](releasing.md)，协作约束见 [AGENTS.md](../AGENTS.md)。

## 环境准备

Aura 使用原生 HTML、CSS 和 TypeScript。安装符合 [package.json](../package.json) 中 `engines.node` 要求的 Node.js，并使用 npm 和仓库的锁文件安装依赖。

在仓库根目录安装依赖：

```sh
npm ci
```

## 本地运行

开发服务器使用 HTTPS，支持同一局域网内的手机访问和热更新。首次运行前需要准备证书；Aura 的文件导入使用 Web Crypto API，普通局域网 HTTP 地址不能满足其安全上下文要求。

### 首次准备开发证书

按 [mkcert 官方说明](https://github.com/FiloSottile/mkcert#installation)安装工具。在仓库根目录运行以下 PowerShell 命令，将示例 IP `192.168.1.100` 替换为开发电脑的局域网 IPv4 地址（可用 `ipconfig` 查看）。已有证书时先备份：

```powershell
New-Item -ItemType Directory -Force .certs | Out-Null
mkcert -cert-file .certs/dev.pem -key-file .certs/dev-key.pem localhost 127.0.0.1 ::1 192.168.1.100
```

Windows 首次使用时，将 mkcert 生成的开发 CA 加入当前用户的受信任根证书，不修改整机或 Java 证书存储：

```powershell
$caDirectory = mkcert -CAROOT
certutil -user -addstore Root "$caDirectory/rootCA.pem"
```

[Vite 配置](../vite.config.ts)只在开发时读取 `.certs/dev.pem` 和 `.certs/dev-key.pem`；构建与产物预览不需要证书。`.certs/` 已由 Git 忽略，不要把证书放入 `src/public/`。局域网 IP 变化后，重新签发包含新地址的证书并重启服务器。

手机首次连接需安装并信任同一个开发 CA，见 [mkcert 移动设备说明](https://github.com/FiloSottile/mkcert#mobile-devices)。iPhone 还需在系统设置中开启完全信任，见 [Apple 证书信任说明](https://support.apple.com/zh-cn/102390)。只传输 `mkcert -CAROOT` 目录中的 `rootCA.pem`；不要传输或提交 CA 私钥 `rootCA-key.pem` 与服务器私钥 `dev-key.pem`。使用同一个 CA 重新签发服务器证书时，无需在手机重复安装 CA。

### 启动与访问

```sh
npm run dev
```

电脑访问 `https://localhost:5173/`；手机访问终端显示的 `Network` 地址，地址需包含在证书中。两端书籍与设置由各自浏览器独立保存。手机可通过该 HTTPS 页面验证导入、阅读和“添加到主屏幕”。

### 注意事项

- 端口固定为 5173。被占用时先确认占用进程，停止不再使用的开发服务器后重试。
- 手机与电脑需处于可互访的局域网；使用实际局域网网卡地址。Windows 防火墙和访客 Wi-Fi 的设备隔离都可能阻止访问。
- 证书不受信任时，先核对访问地址和 CA 信任状态，不用 HTTP 绕过。

## 从哪里读代码

[应用入口](../src/main.ts)根据路由创建页面，[页面生命周期](../src/pages/base-page.ts)管理挂载与销毁。按要修改的功能进入对应模块：

| 功能     | 入口与职责                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 书架     | [Controller](../src/pages/bookshelf/bookshelf-controller.ts)协调导入、分类、搜索和删除；[Service](../src/pages/bookshelf/bookshelf-service.ts)处理正文去重与写入事务 |
| 阅读     | [Controller](../src/pages/reader/reader-controller.ts)协调切章和进度；[UI](../src/pages/reader/reader-ui.ts)处理按钮、键盘、手势与浮层                               |
| TXT 解析 | [parseChapters](../src/domain/chapter/chapter-parser.ts)在写事务前完成解码与分章，按源文件物理行定位内容                                                             |
| 持久化   | [数据库结构](../src/database/database.ts)、[存储操作](../src/database/store.ts)与[事务入口](../src/database/transaction.ts)管理领域数据                              |
| 外观     | [SettingController](../src/settings/setting-controller.ts)管理主题、常规设置、预览与提交；两页外观各自保存到 `localStorage`                                          |

修改数据结构时使用隔离的浏览器配置。项目当前不迁移旧数据；测试库与新结构不兼容时，确认只含可丢弃的测试数据，再从书架执行“重置数据”。清除范围见[使用指南](usage.md#本地数据与-portable-注意事项)。

## 构建与预览

| 命令                                | 输出                                             |
| ----------------------------------- | ------------------------------------------------ |
| `npm run build`                     | `dist/web/`，普通 Web 版                         |
| `npm run build:obfuscated`          | `dist/web-obfuscated/`，混淆 Web 版              |
| `npm run build:portable`            | `dist/portable/aura.html`，普通离线版            |
| `npm run build:portable:obfuscated` | `dist/portable-obfuscated/aura.html`，混淆离线版 |

每个构建命令先执行静态检查，只清理自身输出子目录。Web 目录包含入口、资源、安装元信息、响应头配置和许可声明，需整体使用；portable 将应用资源与许可声明嵌入单个 HTML。

开发服务器与 Web 构建共用安装元信息。可在本地 HTTPS 开发页或 `localhost` 预览中验证浏览器原生安装；安装和离线使用的区别见[使用指南](usage.md)。

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

[CI 工作流](../.github/workflows/ci.yml)对 PR 和 `dev`、`main` 的推送执行 `npm run verify`，并检查两个环境的部署 dry-run。到仓库 [Actions → CI](https://github.com/allurx/aura/actions/workflows/ci.yml) 查看对应提交；上线结果另按[部署指南](deployment.md#自动部署与结果查看)核对。

### 许可声明维护

项目许可证和第三方声明分别维护在 [LICENSE.txt](../LICENSE.txt) 与 [THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt)，产物中的副本由构建生成。源码版权头遵循 [AGENTS.md](../AGENTS.md#工程原则)。

分发的依赖或第三方资源变化时，核对实际进入产物的版本、许可证和版权归属，更新声明后运行 `npm run verify`。检查两种 Web 产物的声明文件与维护源一致，并在两种 portable 的“关于 Aura”中展开全文，确认可离线查看且仍为单个 HTML。

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
