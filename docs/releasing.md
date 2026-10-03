# 发布指南

本文说明如何从已集成的 `main` 提交发布下载文件。推送正式 tag 会触发 [Release 工作流](../.github/workflows/release.yml)，自动验证、打包并创建公开 GitHub Release。Release 标题使用版本 tag，说明由 GitHub 自动生成并使用英文。站点更新仍按[部署指南](deployment.md)进行。

## 准备发布提交

1. 按[分支协作流程](development.md#分支协作)将修改集成到 `main`，确认合并后实际提交的 CI 与本次变更所需的浏览器验收均通过。
2. 用 `git worktree list` 找到 `main` 所在目录；若未被占用，确认当前工作区干净后切换到 `main`。核对分支、remote 和上游，执行 `git pull --ff-only`。有待保留修改或无法快进时，先解决原因。
3. 用 `git rev-parse HEAD` 和 `git show --no-patch HEAD` 确认发布 commit；需要本地复验时按[检查与验证](development.md#检查与验证)执行。
4. 选择未使用的稳定 SemVer tag：`vMAJOR.MINOR.PATCH`，不含预发布后缀、构建元数据或数字前导零。推送会公开发布附件，执行前确认本次操作同时获得 tag 推送和 Release 发布授权。

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

1. **Build release assets** 核对 tag 格式、annotated 类型、检出 commit 及其是否已包含在远端 `main` 中，执行 `npm run verify` 后打包。
2. **Publish GitHub Release** 再次核对远端 tag 对象与 SHA-256，通过 [`gh release create --generate-notes`](https://cli.github.com/manual/gh_release_create) 自动生成英文说明并创建公开 Release。
3. 打开 [Releases](https://github.com/allurx/aura/releases)，核对标题等于版本 tag、英文说明符合实际发布范围，以及[下载文件清单](usage.md#选择下载文件)。四个构建文件与校验清单应齐全，版本号应一致。

从该 Release 下载四项产物与校验清单，按[文件校验方法](usage.md#校验下载文件)逐项核对哈希。解压两种 Web 包，确认含有 `LICENSE.txt` 和 `THIRD-PARTY-NOTICES.txt`；打开两种 portable，从书架菜单的“关于 Aura”展开查看完整声明。校验成功证明下载文件与清单一致，不能代替功能验收。

## 故障处理

- **tag 校验或构建失败**：查看失败步骤，先确认 tag 类型、指向及对应源码的检查结果。源码问题按开发与集成流程修复，随后使用新的发布版本；不要移动已推送的正式 tag 来修补源码。
- **发布步骤失败**：先查看 Releases 和远端 tag，确认是否已经创建 Release、附件是否完整。工作流使用“创建 Release”，不是覆盖已有 Release；遇到已有对象或部分结果时先核对实际状态，不自动删除 tag、覆盖附件或重建 Release。
- **推送超时或网络中断**：先用 `git ls-remote --tags` 检查准确远端 tag，再检查对应 Actions 运行，不能把缺少成功响应当作未推送。
- **同一提交的临时基础设施失败**：确认 tag 未变、Release 尚未创建后，可在对应 Actions 运行中重跑；若构建 artifact 已过期，重跑完整流程。当前工作流会拒绝相对上一发布没有新提交的 Release，遇到该提示先核对发布范围。

站点异常按[部署指南](deployment.md#回滚)处理；回滚站点不会修改已经发布的下载附件。
