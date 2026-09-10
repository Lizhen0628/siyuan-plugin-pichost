# siyuan-plugin-pichost

[English](README.md)

一个[思源笔记](https://b3log.org/siyuan)插件:把文档中的图片上传到自部署的 [PicHost](https://github.com/o96u/PicHost) 图床,并统一管理。

## 功能

- **上传替换**:编辑器中右键图片 → *上传到 PicHost*。本地 `assets/…` 引用会上传到图床,并把块内引用改写为公网外链(本地文件不会被删除)。
- **批量上传**:在文档内右键(或面包屑 *更多* 菜单)→ *上传本文档所有本地图片到 PicHost*。
- **管理面板**:顶栏按钮(或命令 `⇧⌘P`)打开面板,支持分页浏览、关键字搜索、一键复制 URL / Markdown / HTML、删除图片。
- **设置**:可配置服务器地址与 API Token,通过插件数据 API 持久化。

## 开发

1. 安装 Node.js(>= 20)与 pnpm,执行 `pnpm i`。
2. `pnpm run dev` 实时编译;`pnpm run build` 产出 `package.zip`。
3. 建议把本仓库克隆到 `{思源工作空间}/data/plugins/` 目录,在思源“市场 → 下载”中启用。
4. 也可以把仓库放在任意位置:每次 `pnpm run build` 都会通过 `postbuild` 钩子自动把 `dist/` 同步到 `{工作空间}/data/plugins/siyuan-plugin-pichost/`(默认 `~/SiYuanKnowledgeBase/data/plugins`,可用环境变量 `SIYUAN_PLUGINS_DIR` 覆盖),然后在思源中重载插件。

## 配置

| 配置项   | 默认值                             | 说明                    |
| -------- | ---------------------------------- | ----------------------- |
| 服务器地址 | `https://pichost.tools-online.site` | PicHost 实例基础地址    |
| API Token | *(空,需自行填写)*                 | 以 `Auth-Token` 请求头发送 |

> 出于安全考虑,源码中不内置 API 密钥。首次使用前请在**设置 → PicHost** 中填写你的服务器地址与 API Token(在你的 PicHost 实例 API 页面生成)。

## API

实现 [PicHost REST API](https://o96u.github.io/PicHost/guide/api.html):`POST /api/images/upload`、`GET /api/images`、`GET /api/images/search`、`DELETE /api/images`、`POST /api/images/batch-delete`,鉴权使用 `Auth-Token` 请求头(经实测确认;文档中的 `httpAuth-Token` 无效)。

## 说明

- 上传后**不会**删除本地 assets 文件,仅把块引用切换为外链。
- 在管理面板中删除图片会**永久**删除服务器上的文件。
