# 开发指南

本文说明如何运行、修改和验证 Aura。部署在线站点见[部署指南](deployment.md)，发布下载文件见[发布指南](releasing.md)，协作约束见 [AGENTS.md](../AGENTS.md)。

## 环境准备

Aura 使用原生 HTML、CSS 和 TypeScript。本地与 CI 使用 [.node-version](../.node-version) 指定的完整 Node.js LTS 版本，版本约束见 [package.json](../package.json) 的 `engines.node`；使用 npm 和仓库的锁文件安装依赖。检查工具、工具版本和基础构建配置由 [Web Foundation](https://github.com/allurx/web-foundation) 统一维护，Aura 只声明基础包和自身需要的依赖。

在仓库根目录安装依赖：

```sh
npm ci
```

### 浏览器与类型环境

支持桌面和移动端主流常青浏览器的当前及前一个稳定大版本。Vite 继承 Web Foundation 的 `baseline-widely-available` 构建目标，具体浏览器范围随固定的 Vite 版本确定；该目标不会补齐 Web API，也不等于完整的浏览器兼容保证。平台可选能力仍按实际支持情况检测，交互修改按受影响浏览器和输入方式验证。

[TypeScript 配置](../tsconfig.json)分别检查浏览器源码、Node.js 构建配置和测试，共享严格检查选项。浏览器侧只引入 DOM 与 Vite 客户端类型，构建侧使用 Node.js 类型；测试驱动同时描述 Node.js 操作和浏览器中的回调，使用独立配置，不向应用或构建配置泄漏全局 API。Vite/jiti 加载工具配置，因此这部分使用 bundler 模块解析。Vite 在共享构建配置上保留 Hash Router、资源路径、许可声明和 portable 插件；这些交付规则由 Aura 维护。

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

| 功能      | 入口与职责                                                                                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 书架      | [Controller](../src/pages/bookshelf/bookshelf-controller.ts)协调导入、导出、分类、搜索和删除；[Service](../src/pages/bookshelf/bookshelf-service.ts)处理文件去重与写入事务                                                 |
| 阅读      | [Controller](../src/pages/reader/reader-controller.ts)协调进度、目录、设置和页面；[正文](../src/pages/reader/content/content-ui.ts)管理窗口与导航；[UI](../src/pages/reader/reader-ui.ts)处理工具布局                      |
| TXT 解析  | [parseChapters](../src/domain/chapter/chapter-parser.ts)在写事务前完成解码与分章，按源文件物理行定位内容                                                                                                                   |
| EPUB 解析 | [归档读取](../src/domain/file/epub-archive.ts)按需解压与校验资源；[内容解析](../src/domain/file/epub.ts)按阅读顺序和目录建立安全内容模型；[正文渲染](../src/pages/reader/content/epub-content.ts)处理书内图片与链接        |
| 持久化    | [数据库 schema](../src/database/database-schema.ts)集中定义元信息与记录类型映射；[连接与初始化](../src/database/database.ts)、[存储操作](../src/database/store.ts)和[事务入口](../src/database/transaction.ts)管理领域数据 |
| 外观      | [SettingController](../src/settings/setting-controller.ts)管理主题、常规设置、预览与提交；两页外观各自保存到 `localStorage`                                                                                                |

数据库名、版本、store 主键、索引 `keyPath` 和 `unique` 由数据库 schema 统一维护，初始化直接读取这份描述。`StoreRecords` 将 store 名称关联到[领域记录类型](../src/domain/)，具体字段由领域类型定义；存储 API 在编译期约束所选 store 与索引名的组合。命名约束见 [AGENTS.md 的工程原则](../AGENTS.md#工程原则)。

修改数据结构时使用隔离的浏览器配置，保留用户常用配置中的数据。项目当前只初始化当前结构，不迁移旧数据；测试库与新结构不兼容时，确认只含可丢弃的测试数据，并取得重置确认，再从书架执行“重置数据”。清除范围见[使用指南](usage.md#本地数据与-portable-注意事项)。

文件记录保留原始 `Blob`，书籍记录保留导入文件名；导出直接读取它们，不从章节重建或重新编码。相同格式和内容 hash 共享文件与解析结果，分类和进度按书籍分别保存。

### 阅读排版与定位

[翻页方式](../src/pages/reader/reading-mode.ts)由阅读器常规设置保存：覆盖、平移和无动画共用动态分页，上下使用原生连续滚动。[正文 UI](../src/pages/reader/content/content-ui.ts)统一管理章节窗口、排版和导航完成后的实际位置，通过加载回调取得章节，再向 Controller 提交稳定的阅读快照。分页只挂载当前章；连续滚动按实际视窗及相邻方向的缓冲补充章节，并释放远处内容，不假定固定章节数量足以填满视窗。真实书尾的呈现留白使最后短章可以置顶，不计入正文位置。

[阅读输入](../src/pages/reader/reading-input.ts)统一处理正文键盘、触摸、触笔和滚轮，共用交互目标与内嵌滚动判断，各输入仍保留自身的修饰键、阈值和惯性规则。按钮和工具布局由阅读 UI 管理；Controller 协调进度持久化、目录、设置和页面导航。

[阅读进度](../src/domain/progress/progress.ts)保存章节、内容块和块内源偏移。TXT 内容块对应原始行，EPUB 对应受控结构块；`contentOffset` 累计文本的 UTF-16 长度，图片、`br` 和 `hr` 各占一个位置。该契约在[正文定位](../src/pages/reader/content/content-location.ts)中用于 DOM 与源内容之间的映射，不依赖像素偏移、段落高度比例或页码。字体、宽度与视口变化后，用同一内容锚点恢复；临时视觉位置另保留锚点相对视窗的偏移。

覆盖和平移动画按浏览器的 View Transitions 能力启用；缺少能力或启用减少动态效果时直接切换页面，不改写保存的阅读方式。具体操作与章节边界见[使用指南](usage.md#阅读与目录)。

## 构建与预览

| 命令                     | 输出                                    |
| ------------------------ | --------------------------------------- |
| `npm run build`          | `dist/web/`，Web 版                     |
| `npm run build:portable` | `dist/portable/aura.html`，单文件离线版 |

每个构建命令先执行静态检查，只清理自身输出子目录。Web 目录包含入口、资源、安装元信息、响应头配置和许可声明，需整体使用；portable 将应用资源与许可声明嵌入单个 HTML。

开发服务器与 Web 构建共用安装元信息。可在本地 HTTPS 开发页或 `localhost` 预览中验证浏览器原生安装；安装和离线使用的区别见[使用指南](usage.md)。

先构建 Web 版，再启动本地预览：

```sh
npm run build
npm run preview
```

访问 `http://127.0.0.1:4173/`。预览由 Wrangler 读取正式部署配置和静态产物，可检查 Cloudflare 的 `_headers` 等规则；它只提供本地 HTTP 服务，不会部署站点。并行预览其他项目时，可用 `npm run preview -- --port 4175` 临时选择其他端口。修改后重新构建并重启预览。portable 直接通过浏览器打开对应 HTML，验证地址应为 `file://`。

## 检查与验证

| 命令                   | 用途                                 |
| ---------------------- | ------------------------------------ |
| `npm run format:check` | 只检查格式                           |
| `npm run lint`         | 检查 ESLint 规则                     |
| `npm run type-check`   | 检查 TypeScript 类型                 |
| `npm run check`        | 依次执行上述三项只读检查             |
| `npm test`             | 构建两种产物，再执行服务与浏览器回归 |
| `npm run verify`       | 执行一次静态检查，再执行 `npm test`  |

`npm run format` 会改写 Prettier 支持且未被排除的文件，运行后应审查实际 diff。迭代时先运行与改动有关的检查，需要完整验证两种产物时执行 `npm run verify`。

回归测试使用 Node.js 内置测试运行器和 Playwright 浏览器驱动。运行前安装 Google Chrome；测试会启动独立的无界面浏览器和隔离上下文，不连接日常浏览器资料，也不下载浏览器。GitHub Actions 的 Ubuntu runner 已提供 Chrome。[测试目录](../tests/)只保留核心契约：两种交付中的原文件字节与文件名、共享正文删除后的可用性、跨章和重排后的阅读定位，以及导入预算与批次错误结果。具体控件、布局和一次性边界使用临时脚本验证，完成后清理。

浏览器回归用 Vite 的预览 API 在临时端口提供已构建 Web 文件，服务和浏览器随测试结束关闭。它检查应用行为，不代替下文默认 Wrangler 预览中的正式响应头、部署配置及实际设备检查。

构建不能代替运行时检查。页面交互变更应实际验证导航、关闭与取消、焦点和位置恢复、错误反馈及持久化；涉及 portable 时还需实际打开 `file://` 产物。只改文档时检查内容、链接、示例和格式，不运行无关构建。

阅读器变更应覆盖四种方式、前后跨章与目录跳转，以及字号、窗口、横竖屏、全屏和方式切换后的内容位置。分页检查长段落、图片与内部滚动内容；连续滚动检查相邻章替换前后的可见内容和进度。输入检查鼠标、键盘、触摸、滚轮惯性、选字与取消操作，并核对工具显隐和浮层关闭后的焦点、位置及模式保存。

文件流程变更需覆盖各格式的有效文件、明确拒绝的内容和大文件，并核对失败时已完成的导入结果。EPUB 检查目录锚点、书内链接、图片、资源限制和不可信内容。导出使用包含不同 TXT 编码及二进制资源的样本，对比导入文件和实际下载文件的 SHA-256，同时检查文件名；不能用重新解析后的正文相同代替字节一致。

[CI 工作流](../.github/workflows/ci.yml)对 PR 和 `dev`、`main` 的推送执行 `npm run verify`，并检查正式环境的部署 dry-run。只有 `main` 的推送会部署站点。到仓库 [Actions → CI](https://github.com/allurx/aura/actions/workflows/ci.yml) 查看对应提交；上线结果另按[部署指南](deployment.md#自动部署与结果查看)核对。

### 许可声明维护

项目许可证和第三方声明分别维护在 [LICENSE.txt](../LICENSE.txt) 与 [THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt)，产物中的副本由构建生成。源码版权头遵循 [AGENTS.md](../AGENTS.md#工程原则)。

分发的依赖或第三方资源变化时，核对实际进入产物的版本、许可证和版权归属，更新声明后运行 `npm run verify`。检查 Web 产物的声明文件与维护源一致，并在 portable 的“关于 Aura”中展开全文，确认可离线查看且仍为单个 HTML。

## 分支协作

1. 在 `dev` 或以其为基线的任务分支开发，不在 `main` 上直接修改或推送。
2. 改动进入 `dev` 后，核对 CI 并按改动完成本地运行时验证。日常通过 `dev → main` PR 集成，检查最新提交、实际差异与验证结果。
3. 对长期分支 `dev → main` 使用 **Create a merge commit**，保留祖先关系。
4. 合并后按祖先关系将 `main` 同步回 `dev`：可快进时快进，分叉时普通合并，不重写历史或删除长期分支。同步前先确认目标 checkout 与本地修改状态。

提交使用 Conventional Commits；`scope` 可选，仅用于明确的产品或技术边界，跨多个边界时省略。

### 仓库保护配置

仓库管理员在 **Settings → Rules → Rulesets → New ruleset → New branch ruleset** 配置 `main` 保护，确认状态为 **Active**、目标为 `main`：要求通过 PR 和 GitHub Actions 的 `site / verify`，以最新 `main` 验证，并禁止强推和删除。允许 merge commit，不启用线性历史要求；单人项目不强制取得他人 approval。

私有仓库的规则支持取决于 GitHub 套餐，见 [rulesets 可用范围](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)。本地约定或 CI 成功不代表服务器端保护已经启用。

### 依赖更新

第三方 Actions 使用完整 commit SHA 固定，并保留同一行版本注释。[Dependabot 配置](../.github/dependabot.yml)由默认分支 `main` 提供，每周向 `dev` 提交 Actions 与 npm 更新 PR。npm 的 minor 和 patch 更新合并为一组，major 更新单独评估；均由维护者核对并通过验证后合并，再随开发成果集成到 `main`。

共享工具升级先在 Web Foundation 验证，再将 Aura 的基础包 Git 引用和 CI 共享工作流引用统一更新到同一 Immutable Release 的具体 `vX.Y.Z` 标签，并更新锁文件。两条更新路径由 Dependabot 分别检查，合并前仍需核对版本对应关系。Node.js 运行时按基础包要求同步 `.node-version` 与 `engines.node`。具体更新约束见 [Web Foundation 依赖与更新](https://github.com/allurx/web-foundation/blob/main/docs/dependencies.md)。
