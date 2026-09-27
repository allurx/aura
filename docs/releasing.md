# 发布 GitHub Release

本文面向发布维护者，说明如何发布带版本号的下载产物。下载选择见[使用指南](usage.md)。站点部署由独立的 [CI 工作流](../.github/workflows/ci.yml)处理，操作见[部署指南](deployment.md)；推送发布 tag 不会替代站点部署。

## 准备发布提交

1. 按[开发指南的分支协作流程](development.md#分支协作)将待发布修改集成到 `main`，确认合并后实际提交的 CI 结果。
2. 用 `git worktree list` 确定发布所用的 checkout。`main` 已被占用时在对应目录操作；否则先确认工作区干净且不影响进行中的任务，再切换到 `main`。核对 `git status --short --branch`、`git remote -v` 和上游分支，确认无误后执行 `git pull --ff-only`。无法快进或有待保留修改时先处理原因，不用 reset 或强推替代同步。
3. 用 `git rev-parse HEAD` 和 `git show --no-patch HEAD` 核对实际发布 commit。它必须是已经集成、完成项目验证的 `main` 提交；本地复验按[开发指南](development.md#检查与验证)执行。构建成功不替代本次变更需要的浏览器验收。
4. 确定尚未使用的稳定 SemVer 版本号，采用 `vMAJOR.MINOR.PATCH`，不含预发布后缀、构建元数据或数字前导零。确认本次操作同时涵盖 tag 推送和公开 GitHub Release 发布：匹配的 tag 一经推送就会自动进入发布流程。

## 创建并推送准确 tag

以下为 PowerShell 示例。在已核对 remote、`main`、工作区和实际发布 commit 的 checkout 中操作，将 `<remote>` 替换为本次确认的远端名称，将版本占位符替换为本次批准的实际版本号；不要直接执行带占位符的命令。

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

不使用 `git push --tags`。本地创建成功不代表已推送，推送成功也不代表 Release 已发布。正式 tag 由最终发布流程创建，不在普通功能 worktree 中另行创建同名 tag。

## 查看发布与校验产物

在仓库 **Actions → Release** 查看对应 tag 的运行。[Release 工作流](../.github/workflows/release.yml)会验证稳定版本格式、annotated tag 类型、检出 commit，以及该提交是否已包含在远端 `main` 中，然后重新运行 `npm run verify`。

`Build release assets` 成功后，`Publish GitHub Release` 会再次核对远端 tag 对象未变化、检查 SHA-256，并创建公开 Release。到仓库 **Releases** 核对标题与 tag，再按[下载产物清单](usage.md#选择下载文件)确认四个构建文件和校验清单齐全，文件名均使用本次版本号。

从该 Release 下载四项产物与校验清单，按[文件校验方法](usage.md#校验下载文件)逐项核对哈希。校验成功证明下载文件与清单一致，不能代替打开 Web 包与 portable 的功能验收。

## 失败或结果不明

- **tag 校验或构建失败**：查看失败步骤，先确认 tag 类型、指向及对应源码的检查结果。源码问题按开发与集成流程修复，随后使用新的发布版本；不要移动已推送的正式 tag 来修补源码。
- **发布步骤失败**：先查看 Releases 和远端 tag，确认是否已经创建 Release、附件是否完整。工作流使用“创建 Release”，不是覆盖已有 Release；遇到已有对象或部分结果时先核对实际状态，不自动删除 tag、覆盖附件或重建 Release。
- **推送超时或网络中断**：先用 `git ls-remote --tags` 检查准确远端 tag，再检查对应 Actions 运行，不能把缺少成功响应当作未推送。
- **同一提交的临时基础设施失败**：确认 tag 未变、Release 尚未创建后，可在对应 Actions 运行中重跑；若构建 artifact 已过期，重跑完整流程。当前工作流会拒绝相对上一发布没有新提交的 Release，遇到该提示先核对发布范围。

发布成功后无需为发布本身删除分支、worktree 或 tag。站点异常按[部署指南](deployment.md)处理；回滚站点不会修改已经发布的下载附件。
