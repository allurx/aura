# 开发指南

本文面向修改和验证 Aura 源码的开发者。站点操作见[部署指南](deployment.md)，分发新版本见[发布指南](releasing.md)；Agent 执行约束由根目录 [AGENTS.md](../AGENTS.md) 维护。

## 环境准备

Aura 使用原生 HTML、CSS、TypeScript，没有前端运行时框架。需要 Node.js 22.12.0 或更新版本及 npm；版本要求和脚本以 [package.json](../package.json) 为准，依赖由 `package-lock.json` 锁定。

在仓库根目录安装依赖：

```sh
npm ci
```

## 本地运行

开发服务器使用 HTTPS。[Vite 配置](../vite.config.ts)会读取仓库父目录下的 `localhost.pem` 和 `localhost-key.pem`，启动前需准备供本机浏览器信任、适用于 `localhost` 的证书及私钥。私钥留在本机。

```sh
npm run dev
```

访问终端显示的地址，修改源码后由开发服务器更新页面。若没有开发证书，可先构建并预览产物；构建与预览不读取上述证书，但修改源码后需要重新构建。

## 构建与预览

| 命令                                | 输出                                             |
| ----------------------------------- | ------------------------------------------------ |
| `npm run build`                     | `dist/web/`，普通 Web 版                         |
| `npm run build:obfuscated`          | `dist/web-obfuscated/`，混淆 Web 版              |
| `npm run build:portable`            | `dist/portable/aura.html`，普通离线版            |
| `npm run build:portable:obfuscated` | `dist/portable-obfuscated/aura.html`，混淆离线版 |

每个构建命令先执行静态检查，再只清理自身输出子目录，四种产物可以同时保留。Web 输出中的入口、资源、manifest、图标与 `_headers` 属于同一次构建，应整体使用；portable 输出为单个 HTML 文件。

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
