# 发布指南

本文说明如何从已集成的 `main` 提交发布下载文件。推送正式 tag 会触发 [Release 工作流](../.github/workflows/release.yml)，打包已通过验证的 Web 和 portable 产物并创建公开 GitHub Release。Release 标题使用版本 tag，说明由 GitHub 自动生成并使用英文。站点更新仍按[部署指南](deployment.md)进行。

## 准备发布提交

1. 在开发分支确定本次发布版本，用 `npm version <MAJOR.MINOR.PATCH> --no-git-tag-version` 同步更新 `package.json` 与锁文件；该命令不创建提交或 tag。按[分支协作流程](development.md#分支协作)将版本更新和功能修改一起集成到 `main`，确认合并后实际提交的 CI 与本次变更所需的浏览器验收均通过。
2. 用 `git worktree list` 找到 `main` 所在目录；若未被占用，确认当前工作区干净后切换到 `main`。核对分支、remote 和上游，执行 `git pull --ff-only`。有待保留修改或无法快进时，先解决原因。
3. 用 `git rev-parse HEAD` 和 `git show --no-patch HEAD` 确认发布 commit；需要本地复验时按[检查与验证](development.md#检查与验证)执行。
4. 核对未使用的稳定 SemVer tag：`vMAJOR.MINOR.PATCH`，版本必须等于 `package.json` 的 `version`，不含预发布后缀、构建元数据或数字前导零。推送会公开发布附件，执行前确认本次操作同时获得 tag 推送和 Release 发布授权。

## 创建并推送准确 tag

在上述 `main` 目录运行以下 PowerShell 命令。先将 `<remote>` 和版本占位符替换为已核对的远端名称与版本号：

```powershell
$releaseRemote = "<remote>"
$releaseTag = "v<MAJOR>.<MINOR>.<PATCH>"
$releaseCommit = git rev-parse HEAD

git remote get-url $releaseRemote
git tag --list $releaseTag
git ls-remote --tags $releaseRemote "refs/tags/$releaseTag"
```

确认远端地址正确、本地与远端均不存在同名 tag，且 `$releaseCommit` 是上一步核实的发布提交后，创建 annotated tag：

```powershell
git tag -a $releaseTag $releaseCommit -m "Release $releaseTag"
git cat-file -t "refs/tags/$releaseTag"
git rev-parse "${releaseTag}^{commit}"
git show --no-patch $releaseTag
```

核对对象类型为 `tag`，解引用后的 commit 等于 `$releaseCommit`，然后仅推送该 tag：

```powershell
git push $releaseRemote "refs/tags/${releaseTag}:refs/tags/${releaseTag}"
```

不要使用 `git push --tags`。推送成功后，还需检查 Release 工作流和下载文件。

## 查看发布与校验产物

在仓库 [Actions → Release](https://github.com/allurx/aura/actions/workflows/release.yml) 查看对应 tag：

1. **Build release assets** 检查正式 tag 的格式和类型，确认其指向远端 `main` 历史中的提交，并核对应用版本。共享动作按该提交的完整 SHA 查找成功的 `main` 推送 CI，下载同一次 `site / verify` 生成的 Web 和 portable 产物。随后由 Aura 打包并生成 SHA-256 清单。两份 CI 产物保留 7 天，任一份过期或缺失都会停止发布。
2. **Publish GitHub Release** 再次核对远端 tag 对象与 SHA-256，通过 [`gh release create --generate-notes`](https://cli.github.com/manual/gh_release_create) 自动生成英文说明并创建公开 Release。
3. 打开 [Releases](https://github.com/allurx/aura/releases)，核对标题等于版本 tag、英文说明符合实际发布范围，以及[下载文件清单](usage.md#选择下载文件)。两个构建文件与校验清单应齐全，版本号应一致。

从该 Release 下载两项产物与校验清单，按[文件校验方法](usage.md#校验下载文件)逐项核对哈希。解压 Web 包，确认含有 `LICENSE.txt` 和 `THIRD-PARTY-NOTICES.txt`；打开 portable，从书架菜单的“关于 Aura”展开查看完整声明。校验成功证明下载文件与清单一致，不能代替功能验收。

## 故障处理

### CI 产物过期或缺失

1. 确认远端 tag 对象未变，并在 [Releases](https://github.com/allurx/aura/releases) 检查该版本是否已发布。已有 Release 时按上文核对附件与校验清单，只有尚未创建时才继续以下步骤。
2. 在 [Actions → CI](https://github.com/allurx/aura/actions/workflows/ci.yml) 找到原始 `main` 推送运行，核对其完整 SHA 与 tag 指向的提交一致，选择 **Re-run all jobs**。这会重新运行验证并上传两份产物。如果该提交仍是 `main` 的最新提交，正常部署流程也会再次执行。如果 `main` 已前进，部署任务会跳过旧提交。
3. 等待整次 CI 成功，在 **Artifacts** 中确认 `web-` 和 `additional-` 两份产物的运行编号和验证尝试编号相同，然后到 [Actions → Release](https://github.com/allurx/aura/actions/workflows/release.yml) 重跑原 tag 运行中失败的任务。

GitHub 允许在工作流首次运行后的 30 天内重跑。若原 `main` 推送运行不存在，或所需的 CI、Release 运行已超过重跑期限，保留原 tag，按[发布准备流程](#准备发布提交)选择新版本。[GitHub 工作流重跑说明](https://docs.github.com/zh/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)

### 其他发布故障

- **tag 校验失败时**，核对 tag 类型、指向及 `package.json` 版本。源码问题按开发与集成流程修复，并使用新版本发布。
- **推送超时或网络中断**：先用 `git ls-remote --tags` 检查准确远端 tag，再检查对应 Actions 运行，不能把缺少成功响应当作未推送。
- **查询、下载或发布失败时**，先核对远端 tag 和 Release 的实际状态。排除临时故障且确认尚未发布后，重试失败的任务。如果仅发布任务所需的已打包附件过期，重跑整个 Release 工作流以重新打包。若提示相对上一版本没有新提交，核对实际发布范围。

站点异常按[部署指南](deployment.md#回滚)处理；回滚站点不会修改已经发布的下载附件。
