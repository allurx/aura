# 部署指南

本文面向维护 Aura 在线站点的人员，负责 Cloudflare 环境准备、部署、域名与回滚。分支协作见[开发指南](development.md#分支协作)，GitHub Release 分发见[发布指南](releasing.md)。

Web 版使用 Cloudflare Workers Static Assets 托管混淆产物 `dist/web-obfuscated/`，由 [GitHub Actions](../.github/workflows/ci.yml) 验证全部四种构建后部署。环境配置见 [wrangler.jsonc](../wrangler.jsonc)。portable 作为独立 HTML 下载交付，不上传到站点。

将 Web 输出目录作为同一次构建的完整产物一起部署，包括入口、资源、manifest、安装图标与 `_headers`。不要只替换 HTML 或部分资源。

## 准备

1. 本机操作先完成[开发环境准备](development.md#环境准备)。
2. 按 [Cloudflare CI 身份验证说明](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/#1-authentication)取得 Account ID，并创建限定到目标账号的账户 API token。首次创建 Worker 需要 Workers 产品范围的 `Admin`；已有 Worker 的部署权限按 [Workers 权限说明](https://developers.cloudflare.com/workers/authorization/workers/)配置。日常 CI 不修改域名绑定，无需域名写权限。
3. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 添加 `CLOUDFLARE_ACCOUNT_ID`。
4. 在 **Settings → Environments** 创建 `preview` 和 `production`，分别添加 secret `CLOUDFLARE_API_TOKEN`；部署分支分别限制为 `dev` 和 `main`。

Cloudflare 端由 Actions 调用 Wrangler 部署，无需启用 Workers Builds 的 Git 集成。

## 自动部署与结果查看

| 操作          | 行为                                    | 部署目标                                         |
| ------------- | --------------------------------------- | ------------------------------------------------ |
| 创建或更新 PR | 完整验证和两个环境的部署 dry-run        | 不部署                                           |
| 推送 `dev`    | 验证后部署同一次运行的混淆 Web artifact | `aura-preview`，`https://aura-preview.allurx.io` |
| 推送 `main`   | 验证后部署同一次运行的混淆 Web artifact | `aura`，`https://aura.allurx.io`                 |

部署任务下载同一次 `verify` 上传的 artifact，不重新构建；开始部署前会核对远端分支的最新提交。若分支已有更新，旧运行会跳过部署，因此 CI 成功不等于该提交已上线。

在仓库 **Actions → CI** 查看对应提交的验证、artifact 和部署步骤；在 Cloudflare **Workers & Pages → 对应 Worker → Deployments** 核对当前版本，并打开表中的目标站点验收。发布 tag 的 GitHub Release 流程独立运行。

## 本机部署

需要从本机部署时，先通过 Wrangler 登录目标账号，或在当前进程中安全配置 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN`。在目标提交上执行：

```sh
npm run verify
npm run deploy:preview -- --dry-run
npm run deploy:production -- --dry-run
```

确认产物与环境正确后，选择 `npm run deploy:preview` 或 `npm run deploy:production`，分别部署到 `aura-preview` 和 `aura`。始终显式选择环境；直接运行 `wrangler deploy` 会使用顶层名称 `aura`，指向正式 Worker。这两个部署脚本只上传已有 `dist/web-obfuscated/`，不会重新构建；dry-run 不验证远端凭据、域名绑定或实际访问结果。

## 域名绑定

首次部署创建 Worker 后，在 Cloudflare **Workers & Pages → 对应 Worker → Settings → Domains & Routes** 添加自定义域名：`aura-preview.allurx.io` 绑定 `aura-preview`，`aura.allurx.io` 绑定 `aura`。所需 zone 为 `allurx.io`，同名 CNAME 必须先解除冲突，具体要求见 [Cloudflare 自定义域名说明](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

域名通过 Cloudflare 控制台或 API 管理。Wrangler 保持 `workers_dev: false`、`preview_urls: false`，不设置 `route` 或 `routes`，从而保留已有绑定；不要在 CI 中重复创建域名。参见 [Wrangler 配置与控制台的职责划分](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)。

绑定后检查 HTTPS、TXT 导入、章节导航、刷新后的进度与外观，并核对入口和静态资源响应头。两个域名的浏览器存储相互隔离；改变域名不会自动迁移已有书库。

## 回滚

在 Cloudflare 的对应 Worker **Deployments** 中选择已验证的历史版本执行 [Rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)，随后检查所选环境的站点地址，并在 Git 中修复或撤销有问题的改动，避免下一次部署重新带入。

应用版本回滚不会回退用户浏览器中的 IndexedDB、`localStorage` 数据，也不会修改域名绑定。
