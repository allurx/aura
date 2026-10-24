# 开发指南

本文说明如何运行、修改和验证 Aura。部署在线站点见[部署指南](deployment.md)，发布下载文件见[发布指南](releasing.md)，协作约束见 [AGENTS.md](../AGENTS.md)。

## 环境准备

Aura 使用原生 HTML、CSS 和 TypeScript。本地与 CI 使用 [.node-version](../.node-version) 指定的完整 Node.js LTS 版本，版本约束见 [package.json](../package.json) 的 `engines.node`；使用 npm 和仓库的锁文件安装依赖。共享检查与基础构建配置由 [JS Config](https://github.com/allurx/allurx-build/tree/main/js-config) 提供；Aura 直接声明配置包、开发工具和产品依赖的精确版本。

在仓库根目录安装依赖：

```sh
npm ci
```

### 浏览器与类型环境

支持桌面和移动端主流常青浏览器的当前及前一个稳定大版本。Vite 继承 JS Config 的 `baseline-widely-available` 构建目标，具体浏览器范围随固定的 Vite 版本确定；该目标不会补齐 Web API，也不等于完整的浏览器兼容保证。平台可选能力仍按实际支持情况检测，交互修改按受影响浏览器和输入方式验证。

[TypeScript 配置](../tsconfig.json)分别检查浏览器源码、Node.js 构建配置和测试，共享严格检查选项。浏览器侧只引入 DOM 与 Vite 客户端类型，构建侧继承共享 Node.js 配置；测试驱动同时描述 Node.js 操作和浏览器中的回调，使用独立配置，不向应用或构建配置泄漏全局 API。Vite 加载 TypeScript 构建配置，ESLint 通过显式开发依赖 jiti 加载 TypeScript 配置；这些工具配置均纳入 Node.js 类型检查。Vite 在共享构建配置上保留 Hash Router、资源路径、许可声明和 portable 插件；这些交付规则由 Aura 维护。

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

| 功能      | 入口与职责                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 书架      | [Controller](../src/pages/bookshelf/bookshelf-controller.ts)协调导入、导出、分类、搜索和删除；[Service](../src/pages/bookshelf/bookshelf-service.ts)处理文件去重与写入事务                                                                        |
| 阅读      | [Controller](../src/pages/reader/reader-controller.ts)协调进度、目录、设置和页面；[正文](../src/pages/reader/content/content-ui.ts)管理窗口与导航；[UI](../src/pages/reader/reader-ui.ts)处理工具布局                                             |
| TXT 解析  | [parseChapters](../src/domain/chapter/chapter-parser.ts)在写事务前完成解码与分章，按源文件物理行定位内容                                                                                                                                          |
| EPUB 解析 | [归档读取](../src/domain/file/epub-archive.ts)按需解压与校验资源；[内容解析](../src/domain/file/epub.ts)生成[受控内容模型](../src/domain/file/epub-content.ts)；[章节视图](../src/pages/reader/content/chapter-view.ts)负责安全渲染和图片资源释放 |
| 持久化    | [数据库 schema](../src/database/database-schema.ts)集中定义元信息与记录类型映射；[连接与初始化](../src/database/database.ts)、[存储操作](../src/database/store.ts)和[事务入口](../src/database/transaction.ts)管理领域数据                        |
| 外观      | [SettingController](../src/settings/setting-controller.ts)管理主题、常规设置的提交与重置；两页外观各自保存到 `localStorage`                                                                                                                       |

书架的[窗口列表](../src/pages/bookshelf/book-list/book-list-ui.ts)管理挂载范围、滚动位置和操作焦点；[书卡](../src/pages/bookshelf/book-list/book-card-ui.ts)按书籍 ID 保留原生控件，更新标题、分类和进度。Controller 只提供最新摘要，不通过对象身份控制 DOM 复用。

普通浮层开闭优先使用原生焦点行为；列表先保留并移动仍使用的节点，再回收离窗节点。只有节点被替换、隐藏或平台无法保留状态时，所属组件才接续焦点；业务流程不再重复恢复相同目标。

主题、材质、翻页方式和封面选项共用[原生单选控件骨架](../src/settings/controls/radio-setting-control.ts)及其[基础样式](../src/settings/controls/radio-setting-control.css)，分组、点击区域和键盘焦点在此维护；各控件保留自己的图示、说明和排版。设置的值域和应用行为由[定义目录](../src/settings/definitions/)维护，连续控件在原生 input 时实时应用并保存有效值，选项在选择时生效；保存及失败恢复统一归外观 Controller，同值的 change 不重复应用或保存，不建立页面预览会话。

外观以当前页面持有的完整快照同步写入 `localStorage`，保存成功后再应用到界面；保存失败时保留原值并显示错误。页面初始化时恢复已保存的快照，不提供跨页面实时同步或字段合并；多个同类页面同时调整外观时，以最后保存的整页快照为准。书架与阅读器使用独立键，互不覆盖。

数据库名、版本、store 主键、索引 `keyPath` 和 `unique` 由数据库 schema 统一维护，初始化直接读取这份描述。`StoreRecords` 将 store 名称关联到[领域记录类型](../src/domain/)，具体字段由领域类型定义；存储 API 在编译期约束所选 store 与索引名的组合。命名约束见 [AGENTS.md 的工程原则](../AGENTS.md#工程原则)。

修改数据结构时使用隔离的浏览器配置，保留用户常用配置中的数据。项目当前只初始化当前结构，不自动转换旧数据；测试库确实与当前结构不兼容时，确认只含可丢弃的测试数据，并取得重置确认，再从书架执行“重置全部数据”。清除范围见[使用指南](usage.md#本地数据与-portable-注意事项)。

文件记录保留原始 `Blob`，书籍记录保留导入文件名；导出直接读取它们，不从章节重建或重新编码。相同格式和内容 hash 共享文件与解析结果，分类和进度按书籍分别保存。

### 阅读排版与定位

[翻页方式](../src/pages/reader/reading-mode.ts)由阅读器常规设置保存：覆盖、平移和无动画共用动态分页，上下使用原生连续滚动。[正文 UI](../src/pages/reader/content/content-ui.ts)统一管理正文窗口、排版和导航完成后的实际位置，通过加载回调取得章节，再向 Controller 提交稳定的阅读快照。分页只挂载当前章中靠近阅读位置的片段；连续滚动在章内和相邻章之间按视窗与缓冲补充片段，并释放远处内容。真实书尾的呈现留白使最后短章可以置顶，不计入正文位置。

可见正文优先完成排版，精确章节页数与定位索引在不可交互的测量区域内分批计算。打开书籍或实时调整设置不等待整章计算，未知页码使用计算状态，不显示估算值。排版条件改变或页面退出时取消失效任务并释放测量资源；后台测量不得清除正文选区或抢走操作焦点。

精确索引以当前可见内容的局部页界为种子，补全前后页数。原生分栏无法直接对齐时允许临时页尾留白，但不能跳过或重复源文字；索引完成只更新页码信息，不替换已显示的正文或移动阅读位置。局部页界不写入阅读进度，持久化仍使用源内容位置。

[章节目录](../src/pages/reader/toc/toc-ui.ts)保留完整条目用于搜索与导航，由[目录窗口](../src/pages/reader/toc/toc-window.ts)挂载可见范围及焦点、选章操作中的条目。标题按实际宽度换行，测得的行高用于校正章节锚点；未测量高度仅提供临时滚动范围，不进入阅读进度。目录的浏览位置独立于正文位置，关闭重开和清空搜索均恢复对应浏览上下文。

图片在导入时校验有效性，原资源只保存路径和文件内容。阅读时按目标正文窗口和后台测量批次取得固有尺寸，并在当前章节会话中复用；尺寸就绪后才挂载和测量，纯文字首屏不等待整章图片解码。尺寸缓存不进入书库格式，缺少缓存只会重新计算，不要求重置数据。片段只是呈现范围，定位仍使用原内容块及块内源偏移。加载失败保留当前正文；窗口替换、测量完成或取消时释放不再使用的 URL，退出阅读时释放剩余资源。全章精确页码仍需后台分批完成全部相关图片的尺寸准备与排版。

表格、预格式化块和注音结构保留原生整体，不在其内部拆分窗口，以维持表格列、内部滚动和注音关系。单个超大结构的布局成本仍取决于该结构的内容量，不能用普通正文的分片预算推断其上限。

零长度节点参与实际挂载预算。同一源偏移上过多的空结构无法继续按文字位置分片，导入和阅读已有章节共用[内容结构限制](../src/domain/file/epub-content.ts)，超限明确报错，不丢弃空结构或改写阅读位置；支持范围见[使用指南](usage.md#epub-目录与内容)。

[阅读输入](../src/pages/reader/reading-input.ts)统一处理正文键盘、触摸、触笔和滚轮，共用交互目标与内嵌滚动判断，各输入仍保留自身的修饰键、阈值和惯性规则。按钮和工具布局由阅读 UI 管理；Controller 协调进度持久化、目录、设置和页面导航。

[阅读进度](../src/domain/progress/progress.ts)保存章节、内容块和块内源偏移。TXT 内容块对应原始行，EPUB 对应受控结构块；`contentOffset` 累计文本的 UTF-16 长度，图片、`br` 和 `hr` 各占一个位置。该契约在[正文定位](../src/pages/reader/content/content-location.ts)中用于 DOM 与源内容之间的映射，不依赖像素偏移、段落高度比例或页码。EPUB 书内锚点也先解析为源位置，再共用窗口准备和定位流程；空锚点无需生成可见节点，仍可指向对应内容边界。字体、宽度与视口变化后，用同一内容锚点恢复；临时视觉位置另保留锚点相对视窗的偏移。

进度快照直接提交数据库事务，由 IndexedDB 对重叠 store 的事务按创建顺序调度。退出后重新打开书籍时，读取等待此前保存完成；页面实例不另建延迟创建事务的队列，以免新会话读到中间位置。保存失败仍通过统一错误路径反馈，成功后才更新内存中的已保存进度。

覆盖和平移使用阅读器内部的有界正文投影与 Web Animations。正文和页边留白作为同一纸面移动，外框、圆角、工具和浮层保持原位。触摸拖动先准备目标内容并展示预览，不替换实际正文或保存进度；松手确认后提交同一个目标，取消时释放预览并保留原位置。排版变化与页面退出取消失效预览，图片沿用章节资源的保留与释放流程。缺少动画能力或启用减少动态效果时直接切换页面，不改写保存的阅读方式。具体操作与章节边界见[使用指南](usage.md#阅读与目录)。

## 构建与预览

| 命令                     | 输出                                    |
| ------------------------ | --------------------------------------- |
| `npm run build`          | `dist/web/`，Web 版                     |
| `npm run build:portable` | `dist/portable/aura.html`，单文件离线版 |

构建命令只生成对应产物，并只清理自身输出子目录。静态检查使用 `npm run check`，包含检查、两种构建和行为回归的完整门禁使用 `npm run verify`。Web 目录包含入口、资源、安装元信息、响应头配置和许可声明，需整体使用；portable 将应用资源与许可声明嵌入单个 HTML。

“关于 Aura”的程序版本由 `package.json` 的 `version` 在构建时写入，两种交付保持一致，不在运行时联网查询。发布前的版本更新见[发布指南](releasing.md#准备发布提交)。

JS 与 CSS 使用 [Vite 的生产压缩](https://vite.dev/config/build-options.html#build-minify)，无用模块由构建器消除。构建日志中的 gzip 大小只是传输体积估计；Web 的实际编码由 [Cloudflare 内容压缩](https://developers.cloudflare.com/speed/optimization/content/compression/)与客户端协商，应检查线上响应的 `Content-Encoding`。portable 的直接交付大小以 HTML 文件字节数为准，不能把 gzip 或 Brotli 估计当作本地单文件大小。

[Vite 配置](../vite.config.ts)组合交付方式、资源路径与插件；[Web 元信息插件](../build/web-app.ts)维护安装和公开站点信息，[portable 插件](../build/portable.ts)在内联完成后确定单文件入口名称，[许可插件](../build/licenses.ts)生成页面说明和分发文件，并核对最终入口中的声明完整性。`build/` 与根配置共用 Node.js 类型检查环境。

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
| `npm run check`        | 依次执行上述三项静态检查             |
| `npm test`             | 构建两种产物，再执行服务与浏览器回归 |
| `npm run verify`       | 执行一次静态检查，再执行 `npm test`  |

`npm run format` 会改写 Prettier 支持且未被排除的文件，运行后应审查实际 diff。迭代时先运行与改动有关的检查，需要完整验证两种产物时执行 `npm run verify`。

回归测试使用 Node.js 内置测试运行器和 Playwright 浏览器驱动。运行前安装 Google Chrome；测试会启动独立的无界面浏览器和隔离上下文，不连接日常浏览器资料，也不下载浏览器。GitHub Actions 的 Ubuntu runner 已提供 Chrome。[测试目录](../tests/)保留原文件保真、共享正文与事务完整性、EPUB 内容语义及资源边界、阅读定位和外观保存等核心契约。存储故障用例严格匹配预期诊断，其余浏览器错误、警告和 DevTools Issues 仍会使测试失败。具体控件、布局和一次性边界使用临时脚本验证，完成后清理。

浏览器回归用 Vite 的预览 API 在临时端口提供已构建 Web 文件，服务和浏览器随测试结束关闭。它检查应用行为，不代替下文默认 Wrangler 预览中的正式响应头、部署配置及实际设备检查。

构建不能代替运行时检查。页面交互变更应实际验证导航、关闭与取消、焦点和位置恢复、错误反馈及持久化；涉及 portable 时还需实际打开 `file://` 产物。只改文档时检查内容、链接、示例和格式，不运行无关构建。

阅读器变更应覆盖四种方式、前后跨章与目录跳转，以及字号、窗口、横竖屏、全屏和方式切换后的内容位置。尺寸变化包括连续双向调整及窄、矮视窗；无主动导航时检查同一源锚点不漂移，恢复原尺寸后比较原可见内容和位置。全屏验证同时确认浏览器状态与实际窗口尺寸，不用仅改变视口的测试代替物理全屏。分页检查长段落、图片与内部滚动内容；连续滚动检查相邻章替换前后的可见内容和进度。输入检查鼠标、键盘、触摸、滚轮惯性、选字与取消操作；跟手翻页还要核对拖动中进度不变、反拉及取消不翻页、确认后实际正文与预览一致，并核对工具显隐和浮层关闭后的焦点、位置及模式保存。

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

[Renovate 配置](../.github/renovate.json)继承 allurx-build 的版本化共享策略，向 `dev` 提交 npm、GitHub Actions 和 Node.js 更新。GitHub Actions 固定完整 commit SHA，并保留同一行版本注释；配置包和工具依赖保存 npm 精确版本及锁文件。

Renovate 仅在共享策略允许且全部外部状态检查通过后自动合并，并遵守既有分支保护规则。配置包和共享工作流更新保留人工审核。安装启用、版本分组、排除范围与失败处理见[共享依赖更新指南](https://github.com/allurx/allurx-build/blob/main/docs/dependency-updates.md)。Aura 保留项目自己的完整站点验证和分支保护，不维护自动合并脚本。

依赖 PR 合入 `dev` 后仍按正常的 `dev → main` 流程集成；`main` 的 CI 验证并部署实际提交。配置包和工作流独立更新，不能只更新引用而跳过对应验证。`@allurx/js-config` 或构建工具升级时验证 Web 与 portable 两种交付；Node.js 升级时同步 `.node-version` 与 `engines.node`。
