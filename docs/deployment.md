# 部署指南

本文说明如何配置、部署和回滚 Aura 在线站点。日常通过 GitHub Actions 部署；分支集成见[开发指南](development.md#分支协作)，下载文件分发见[发布指南](releasing.md)。

站点使用 Cloudflare Workers Static Assets 托管 `dist/web/`。只维护一个正式 Worker，名称、资源目录和自定义域名由 [wrangler.jsonc](../wrangler.jsonc) 统一管理：

| 部署分支 | GitHub Environment | Worker | 站点                               |
| -------- | ------------------ | ------ | ---------------------------------- |
| `main`   | `production`       | `aura` | [正式站点](https://aura.allurx.io) |

部署完整 Web 目录，包括资源和许可声明。portable 通过独立 HTML 下载交付，不上传到站点。

## 首次配置

按 [Web Foundation 部署说明](https://github.com/allurx/web-foundation/blob/main/docs/deployment.md#保存部署凭据)准备 GitHub `production` Environment、Account ID 和 API token，并将允许部署的分支限制为 `main`。Account ID 和 API token 均保存在 `production` Environment，分别使用 variable 和 secret。首次部署前核对下文的[域名配置](#域名配置)。

[CI 工作流](../.github/workflows/ci.yml)与基础包固定同一 Immutable Release 的具体版本标签，传入 Web 目录和正式站点地址，并通过 `secrets: inherit` 继承调用方可用的 secrets。部署 job 从 `production` Environment 读取 token；PR 和 `dev` 的验证不需要生产凭据。保持 Cloudflare Workers Builds 的 Git 集成关闭，避免同一提交从两个入口部署。

## 自动部署与结果查看

- **创建或更新 PR、推送 `dev`**：运行 `npm run verify` 和正式环境的部署 dry-run，不部署。
- **推送 `main`**：完成相同验证后，上传本次运行的 Web 产物并部署到正式环境。

部署任务下载同一次 `verify` 上传的 artifact，不重新构建。部署前若发现分支已有新提交，旧运行会跳过部署；部署时将 commit SHA 和 Actions 运行链接写入 Cloudflare 版本信息。

1. 在仓库 [Actions → CI](https://github.com/allurx/aura/actions/workflows/ci.yml) 找到目标提交，确认 `site / verify` 和 `site / deploy` 均成功，且部署未被跳过。
2. 在 Cloudflare **Workers & Pages → aura → Deployments** 核对当前版本的 commit SHA 和 Actions 运行链接。
3. 打开正式站点，检查 TXT 导入、章节导航、刷新后的进度与外观，以及入口和静态资源响应头。

CI 成功不等于目标提交已上线；GitHub Release 的 tag 流程也不会触发站点部署。

## 本机部署

先完成[开发环境准备](development.md#环境准备)，通过 Wrangler 登录目标账号，或在当前进程中配置上述环境变量。确认当前源码是要部署的版本后，构建并检查正式环境：

```sh
npm run verify
npm run deploy -- --dry-run
```

核对 dry-run 的 Worker 名称和资源目录，以及 `wrangler.jsonc` 中的域名，再执行：

```sh
npm run deploy
```

完成后按[自动部署与结果查看](#自动部署与结果查看)中的站点检查步骤验收。

### 注意事项

- 部署脚本只上传已有 `dist/web/`，不会重新构建。
- `npm run deploy` 指向唯一的正式 Worker；GitHub 的 `production` Environment 用于隔离部署凭据，不对应额外的 Wrangler 环境。
- dry-run 只检查本地配置和打包结果，不验证远端凭据、域名绑定或站点访问。

## 域名配置

在 `wrangler.jsonc` 的 `routes` 中维护自定义域名 `aura.allurx.io`，设置 `custom_domain: true`，由部署同步到 Cloudflare。所需 zone 为 `allurx.io`，同名 CNAME 必须先解除冲突，具体要求见 [Cloudflare 自定义域名说明](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

Wrangler 配置是部署配置的维护源；域名变更先修改配置并审查 diff，避免仅在控制台修改后被下次部署覆盖。保持 `workers_dev: false`、`preview_urls: false`，仅通过正式域名提供站点。参见 [Wrangler 配置来源说明](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)。

绑定后检查 HTTPS 和站点功能。不同域名的浏览器存储相互隔离；改变域名不会自动迁移已有书库。

## 回滚

在 Cloudflare 的 `aura` Worker **Deployments** 中选择已验证的历史版本执行 [Rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)，随后检查正式站点，并在 Git 中修复或撤销有问题的改动，避免下一次部署重新带入。

应用版本回滚不会回退用户浏览器中的 IndexedDB、`localStorage` 数据，也不会修改域名绑定。
