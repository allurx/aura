# Cloudflare 部署

Web 版使用 Cloudflare Workers Static Assets 托管 `dist/`，由 [GitHub Actions](../.github/workflows/ci.yml) 验证后部署。环境配置见 [wrangler.jsonc](../wrangler.jsonc)。portable 仍单独生成 `dist-portable/aura.html`，不上传到站点。

## 准备

1. 安装 Node.js 22.12.0 或更新版本，在仓库根目录运行 `npm ci`。
2. 按 [Cloudflare CI 身份验证说明](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/#1-authentication)取得 Account ID，并创建限定到目标账号的账户 API token。首次创建 Worker 使用 `Workers Admin`，保留 `Account Settings Read`；生产环境另需仅针对 `allurx.io` 的 `Workers Routes Write`，预览环境不需要域名权限。权限含义见 [Workers 权限说明](https://developers.cloudflare.com/workers/authorization/workers/)。
3. 在 GitHub 仓库的 **Settings → Secrets and variables → Actions → Variables** 添加 `CLOUDFLARE_ACCOUNT_ID`。
4. 在 **Settings → Environments** 创建 `preview` 和 `production`，分别添加 secret `CLOUDFLARE_API_TOKEN`；部署分支分别限制为 `dev` 和 `main`。首次切换域名前先配置并验收 `preview`，完成下文切换准备后再启用 `production` 凭据。

Cloudflare 端由 Actions 调用 Wrangler 部署，无需启用 Workers Builds 的 Git 集成。

## 触发与查看

| 操作          | 行为                                | 部署目标                                                  |
| ------------- | ----------------------------------- | --------------------------------------------------------- |
| 创建或更新 PR | 完整验证和两个环境的部署 dry-run    | 不部署                                                    |
| 推送 `dev`    | 验证后部署同一次运行的 Web artifact | `aura-preview`，`https://aura-preview.allurx.workers.dev` |
| 推送 `main`   | 验证后部署同一次运行的 Web artifact | `aura`，`https://aura.allurx.io`                          |

在仓库 **Actions → CI** 查看验证、artifact 和部署结果；在 Cloudflare **Workers & Pages → 对应 Worker → Deployments** 核对当前版本。发布 tag 的 GitHub Release 流程独立运行。

需要从本机部署时，先通过 Wrangler 登录目标账号，或在当前进程中安全配置 `CLOUDFLARE_ACCOUNT_ID` 与 `CLOUDFLARE_API_TOKEN`。在目标提交上执行：

```sh
npm ci
npm run verify
npm run deploy:preview -- --dry-run
npm run deploy:production -- --dry-run
```

确认产物与环境正确后，选择 `npm run deploy:preview` 或 `npm run deploy:production`。这两个命令只上传已有 `dist/`，不会重新构建；dry-run 不验证远端凭据、域名绑定或实际访问结果。

## 首次从 Pages 切换

如果 `aura.allurx.io` 仍绑定 Pages 项目 `aura`，先完成以下操作，再开始正式部署：

1. 将待发布版本部署到预览地址，检查 TXT 导入、阅读、刷新后的进度与外观、页面导航及移动端交互。预览域名与正式域名的浏览器存储相互隔离。
2. 确认正式版本验证通过，记录 Pages 域名绑定与 DNS 记录。在 Pages 的 **Custom domains** 中移除 `aura.allurx.io` 绑定；检查 DNS，仅移除该主机名仍指向 `aura-csf.pages.dev` 的冲突 CNAME，保留 Pages 项目。
3. 启用 `production` 凭据并触发 `main` 的部署，或从已验证的正式提交执行 `npm run deploy:production`，由 Wrangler 创建 `aura.allurx.io` 的 Workers Custom Domain。
4. 确认域名与证书已生效，访问正式地址复查上述核心操作，并核对入口 HTML、静态资源和响应头。

解绑与重新绑定之间可能短暂不可用，请安排切换时间。Workers Custom Domain 不能与同名 CNAME 共存，具体要求见 [Cloudflare 自定义域名说明](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

## 回滚

在 Cloudflare 的对应 Worker **Deployments** 中选择已验证的历史版本执行 [Rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)，随后检查正式地址，并在 Git 中修复或撤销有问题的改动，避免下一次部署重新带入。

应用版本回滚不会回退用户浏览器中的 IndexedDB、`localStorage` 数据，也不会恢复 Pages 域名绑定。若要切回 Pages，需另行恢复域名配置。
