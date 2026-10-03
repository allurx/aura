# Aura

[Aura](https://aura.allurx.io) 是一个轻量的本地 TXT 阅读器。导入自己的文本，按分类整理书架，接着上次的位置阅读。无需账户，书籍与阅读进度保存在当前浏览器中。

## 特性

- 自动识别 TXT 编码与章节，按书名或章节名查找。
- 适应桌面与移动阅读，支持目录、键盘和触摸切章。
- 提供多种主题与排版设置，书架和阅读器的外观独立保存。
- 提供 Web 版与单文件 portable 离线版；支持的浏览器可将 Web 版安装为应用。

## 开始阅读

1. 打开[在线版](https://aura.allurx.io)。需要离线打开时，从 [GitHub Releases](https://github.com/allurx/aura/releases) 下载 `aura-portable-vX.Y.Z.html`，用浏览器打开；`vX.Y.Z` 为所选版本号。
2. 点击“导入 TXT”，选择自己的文本文件，再点击书封开始阅读。
3. 通过“目录”切章或“外观”调整排版。手机端先轻点正文中间区域唤出工具；下次打开同一本书时会恢复阅读位置。

版本选择、书架整理和详细操作见[使用指南](docs/usage.md)。

### 注意事项

- 只支持 `.txt`。无法可靠识别编码的文件会被拒绝，可另存为 UTF-8 后重试。
- Web 版安装后仍需联网打开；离线使用请选择 portable。安装方式见[使用指南](docs/usage.md#安装应用)。
- 请保留原始 TXT。浏览器数据不会自动同步，portable HTML 也不包含已导入的书籍和进度；存储与清理说明见[本地数据注意事项](docs/usage.md#本地数据与-portable-注意事项)。

## 文档导航

| 文档                            | 内容                                     |
| ------------------------------- | ---------------------------------------- |
| [使用指南](docs/usage.md)       | 下载、导入、整理、阅读与本地数据         |
| [开发指南](docs/development.md) | 环境准备、本地运行、构建与验证           |
| [部署指南](docs/deployment.md)  | 正式站点部署、域名和回滚                 |
| [发布指南](docs/releasing.md)   | 创建版本、发布 GitHub Release 与核对产物 |

## 许可证

[Apache License 2.0](LICENSE.txt)。第三方组件与资源的许可见[第三方声明](THIRD-PARTY-NOTICES.txt)。
