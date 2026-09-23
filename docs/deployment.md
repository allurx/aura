# Cloudflare 部署

Web 版使用 Cloudflare Workers Static Assets 托管 `dist/web/`，由 [GitHub Actions](../.github/workflows/ci.yml) 验证后部署。环境配置见 [wrangler.jsonc](../wrangler.jsonc)。portable 仍单独生成 `dist/portable/aura.html`，不上传到站点。

Web 包中的 `index.html`、`assets/` 和 `_headers` 应作为同一次构建的完整产物一起部署。

## 准备

1. 安装 Node.js 22.12.0 或更新版本，在仓库根目录运行 `npm ci`。
2. 按 [Cloudflare CI 身份验证说明](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/#1-authentication)取得 Account ID，并创建限定到目标账号的账户 API token。首次创建 Worker 使用 `Workers Admin`，保留 `Account Settings Read`；日常 CI 不修改域名绑定，无需域名写权限。权限含义见 [Workers 权限说明](https://developers.cloudflare.com/workers/authorization/workers/)。
3. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 添加 `CLOUDFLARE_ACCOUNT_ID`。
4. 在 **Settings → Environments** 创建 `preview` 和 `production`，分别添加 secret `CLOUDFLARE_API_TOKEN`；部署分支分别限制为 `dev` 和 `main`。

Cloudflare 端由 Actions 调用 Wrangler 部署，无需启用 Workers Builds 的 Git 集成。

## 分支协作与保护

1. 在 `dev` 或基于它的任务分支开发，将改动提交到 `dev` 并推送，等待预览 CI 和部署成功。
2. 完成预览验收后，日常通过 `dev → main` PR 集成正式版本。CI 验证 PR 内容，不额外限制来源分支。
3. 核对最新提交的 `verify` 和实际差异，使用 **Create a merge commit** 合并 PR。合并更新 `main` 后自动部署正式站点，不在本地直接推送 `main`。
4. 合并后将 `main` 同步回 `dev`：可快进时快进，已有分叉时普通合并并保留双方改动。

仓库管理员在 **Settings → Rules → Rulesets → New ruleset → New branch ruleset** 中直接配置 `main` 保护，确认状态为 **Active**、目标为 `main`。要求通过 PR 和 GitHub Actions 的 `verify` 检查，以最新 main 验证，并禁止强推和删除。允许 merge commit，不启用线性历史要求；不强制单人项目取得他人 approval。

私有仓库启用这些服务器端规则需要支持的 GitHub 套餐，具体见 [rulesets 可用范围](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)。套餐不支持时，CI 结果不能成为强制合入门禁，也无法阻止直接推送。

## 触发与查看

| 操作          | 行为                                | 部署目标                                         |
| ------------- | ----------------------------------- | ------------------------------------------------ |
| 创建或更新 PR | 完整验证和两个环境的部署 dry-run    | 不部署                                           |
| 推送 `dev`    | 验证后部署同一次运行的 Web artifact | `aura-preview`，`https://aura-preview.allurx.io` |
| 推送 `main`   | 验证后部署同一次运行的 Web artifact | `aura`，`https://aura.allurx.io`                 |

在仓库 **Actions → CI** 查看验证、artifact 和部署结果；在 Cloudflare **Workers & Pages → 对应 Worker → Deployments** 核对当前版本。发布 tag 的 GitHub Release 流程独立运行。

Actions 保持完整 SHA 固定。[Dependabot 配置](../.github/dependabot.yml)进入默认分支 `main` 后，每周向 `dev` 提交 Actions 更新 PR，并更新同一行的版本注释；审核和合并仍由维护者执行。

需要从本机部署时，先通过 Wrangler 登录目标账号，或在当前进程中安全配置 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN`。在目标提交上执行：

```sh
npm ci
npm run verify
npm run deploy:preview -- --dry-run
npm run deploy:production -- --dry-run
```

确认产物与环境正确后，选择 `npm run deploy:preview` 或 `npm run deploy:production`，分别部署到 `aura-preview` 和 `aura`。始终显式选择环境；直接运行 `wrangler deploy` 会使用顶层名称 `aura`，指向正式 Worker。这两个部署脚本只上传已有 `dist/web/`，不会重新构建；dry-run 不验证远端凭据、域名绑定或实际访问结果。

## 域名绑定

首次部署创建 Worker 后，在 Cloudflare **Workers & Pages → 对应 Worker → Settings → Domains & Routes** 添加自定义域名：`aura-preview.allurx.io` 绑定 `aura-preview`，`aura.allurx.io` 绑定 `aura`。所需 zone 为 `allurx.io`，同名 CNAME 必须先解除冲突，具体要求见 [Cloudflare 自定义域名说明](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

域名通过 Cloudflare 控制台或 API 管理。Wrangler 保持 `workers_dev: false`、`preview_urls: false`，不设置 `route` 或 `routes`，从而保留已有绑定；不要在 CI 中重复创建域名。参见 [Wrangler 配置与控制台的职责划分](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)。

绑定后检查 HTTPS、TXT 导入、章节导航、刷新后的进度与外观，并核对入口和静态资源响应头。两个域名的浏览器存储相互隔离；改变域名不会自动迁移已有书库。

## 回滚

在 Cloudflare 的对应 Worker **Deployments** 中选择已验证的历史版本执行 [Rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)，随后检查正式地址，并在 Git 中修复或撤销有问题的改动，避免下一次部署重新带入。

应用版本回滚不会回退用户浏览器中的 IndexedDB、`localStorage` 数据，也不会修改域名绑定。
