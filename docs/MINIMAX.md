# MiniMax 原生图片接口

本地维护版新增 `minimax` provider，兼容已有的 `minimaxBaseURL`、`minimaxModel` 配置。聊天里的 `generate_image` / `generate_images` 和图片工作台均使用同一套接入。

在图像生成设置中选择 **MiniMax**，保存 API Key（凭据名 `MINIMAX_API_KEY`）。也可由宿主环境提供该变量。配置示例：

```yaml
provider: minimax
minimaxBaseURL: https://api.minimax.cn/v1
minimaxModel: image-01
```

默认模型为 `image-01`，可按账号权限选择 `image-01-live`。支持的宽高比：`1:1`、`16:9`、`4:3`、`3:2`、`2:3`、`3:4`、`9:16`、`21:9`。提示词长度为 1–1500 字符。

此版提供文生图，不将 MiniMax 的人物主体参考功能冒充通用图片编辑。工作台不开放 MiniMax 编辑模式，聊天中误用 `edit_image` 会给出切换到 `generate_image` 的提示。

MiniMax 不提供此插件可用的免费鉴权探测。模型列表使用公开的静态目录；它不代表当前账号已经获得模型权限。验证实际连接需要生成一张图片，会按上游规则计费。聊天订阅额度与开放平台图片 API 权限应分别确认。

接口使用 `POST /v1/image_generation`，检查 `base_resp.status_code`，从 `data.image_urls` 读取结果。下载图片不向图片 CDN 转发 API Key，保留宿主代理配置、取消信号、图片大小限制和错误脱敏。

官方文档：[MiniMax 文生图](https://platform.minimax.cn/docs/api-reference/image-generation-t2i)。

## 构建与本地安装

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
dsh plugin --profile desktop add <repo>
```

本地 `link:` 安装需要保留 `lib/`；改源码后重新构建并重启 DSH。市场的原版不包含此扩展，更新原版不能替代更新这份源码。
