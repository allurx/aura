# 部署指南

本文说明如何配置、部署和回滚 Aura 在线站点。日常通过 GitHub Actions 部署；分支集成见[开发指南](development.md#分支协作)，下载文件分发见[发布指南](releasing.md)。

站点使用 Cloudflare Workers Static Assets 托管 `dist/web-obfuscated/`，环境由 [wrangler.jsonc](../wrangler.jsonc) 定义：

| 分支   | GitHub / Wrangler 环境 | Worker         | 站点                                       |
| ------ | ---------------------- | -------------- | ------------------------------------------ |
| `dev`  | `preview`              | `aura-preview` | [预览站点](https://aura-preview.allurx.io) |
| `main` | `production`           | `aura`         | [正式站点](https://aura.allurx.io)         |

部署完整 Web 目录，包括资源和许可声明。portable 通过独立 HTML 下载交付，不上传到站点。

## 首次配置

1. 按 [Cloudflare CI 身份验证说明](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/#1-authentication)取得 Account ID 并创建限定到目标账号的 API token。首次创建 Worker 与日常部署所需权限不同，按 [Workers 权限说明](https://developers.cloudflare.com/workers/authorization/workers/)配置。日常 CI 不修改域名绑定，无需域名写权限。
2. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 添加 `CLOUDFLARE_ACCOUNT_ID`。
3. 在 **Settings → Environments** 创建 `preview` 和 `production`，分别添加 secret `CLOUDFLARE_API_TOKEN`；部署分支分别限制为 `dev` 和 `main`。
4. 首次部署创建 Worker 后，完成下文的[域名绑定](#域名绑定)，再检查站点。

[CI 工作流](../.github/workflows/ci.yml)已包含验证与部署步骤，Cloudflare 端无需再启用 Workers Builds 的 Git 集成。

## 自动部署与结果查看

- **创建或更新 PR**：运行 `npm run verify` 和两个环境的部署 dry-run，不部署。
- **推送 `dev` 或 `main`**：完成相同验证后，将本次运行的混淆 Web 产物部署到对应环境。

部署任务下载同一次 `verify` 上传的 artifact，不重新构建。部署前若发现分支已有新提交，旧运行会跳过部署。

1. 在仓库 [Actions → CI](https://github.com/allurx/aura/actions/workflows/ci.yml) 找到目标提交，确认验证和部署步骤均成功，且部署未被跳过。
2. 在 Cloudflare **Workers & Pages → 对应 Worker → Deployments** 核对当前版本。
3. 打开目标站点，检查 TXT 导入、章节导航、刷新后的进度与外观，以及入口和静态资源响应头。

CI 成功不等于目标提交已上线；GitHub Release 的 tag 流程也不会触发站点部署。

## 本机部署

先完成[开发环境准备](development.md#环境准备)，通过 Wrangler 登录目标账号，或在当前进程中配置上述环境变量。确认当前源码是要部署的版本后构建并检查目标环境。以下以预览环境为例：

```sh
npm run verify
npm run deploy:preview -- --dry-run
```

核对 dry-run 的 Worker 名称和资源目录，再执行：

```sh
npm run deploy:preview
```

部署正式环境时，将两条 `deploy:preview` 命令都换成 `deploy:production`。完成后按[自动部署与结果查看](#自动部署与结果查看)中的站点检查步骤验收。

### 注意事项

- 部署脚本只上传已有 `dist/web-obfuscated/`，不会重新构建。
- 始终显式选择环境。直接运行 `wrangler deploy` 会使用顶层名称 `aura`，指向正式 Worker。
- dry-run 只检查本地配置和打包结果，不验证远端凭据、域名绑定或站点访问。

## 域名绑定

首次部署创建 Worker 后，在 Cloudflare **Workers & Pages → 对应 Worker → Settings → Domains & Routes** 添加自定义域名：`aura-preview.allurx.io` 绑定 `aura-preview`，`aura.allurx.io` 绑定 `aura`。所需 zone 为 `allurx.io`，同名 CNAME 必须先解除冲突，具体要求见 [Cloudflare 自定义域名说明](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

域名通过 Cloudflare 控制台或 API 管理。Wrangler 保持 `workers_dev: false`、`preview_urls: false`，不设置 `route` 或 `routes`，从而保留已有绑定；不要在 CI 中重复创建域名。参见 [Wrangler 配置与控制台的职责划分](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)。

绑定后检查 HTTPS 和站点功能。两个域名的浏览器存储相互隔离；改变域名不会自动迁移已有书库。

## 回滚

在 Cloudflare 的对应 Worker **Deployments** 中选择已验证的历史版本执行 [Rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)，随后检查所选环境的站点地址，并在 Git 中修复或撤销有问题的改动，避免下一次部署重新带入。

应用版本回滚不会回退用户浏览器中的 IndexedDB、`localStorage` 数据，也不会修改域名绑定。
