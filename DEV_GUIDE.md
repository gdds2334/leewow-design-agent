# Leewow Design Agent - 本地开发指南

这份指南用于帮助开发人员（或 AI 助手）快速、正确地启动本地开发环境。

## 1. 核心依赖与环境要求

- **Node.js**: 推荐 v18+
- **包管理器**: npm
- **API Key**: 需要 Laozhang AI 的 API Key
- **FFmpeg**: 视频生成功能依赖浏览器端 FFmpeg (WASM)

## 2. 首次配置 (Setup)

如果你是第一次拉取项目或刚刚回滚代码，请按以下步骤操作：

### 2.1 安装依赖
```bash
npm install
```
*注意：如果遇到 `@ffmpeg` 相关权限报错，请尝试 `npm install --force` 或检查文件权限。*

### 2.2 配置环境变量
确保项目根目录下有 `.env.local` 文件，且包含以下内容：
```env
NEXT_PUBLIC_LAOZHANG_API_KEY=your_api_key_here
```
*关键点：变量名必须以 `NEXT_PUBLIC_` 开头，否则前端无法读取。*

## 3. 启动项目 (Start)

### 3.1 标准启动
```bash
npm run dev
```
项目将在 `http://localhost:3000` 启动。

### 3.2 清理并启动 (推荐)
如果遇到缓存问题（如 404 错误、样式不更新），请使用：
```bash
rm -rf .next
npm run dev
```
或者使用项目自带的脚本：
```bash
./restart_clean.sh
```

## 4. 关键功能注意事项

### 4.1 视频生成 (FFmpeg)
- 本地调试视频生成功能时，**必须**确保 `next.config.mjs` 中配置了以下 Headers，否则 FFmpeg WASM 会报错 (`SharedArrayBuffer is not defined`)：
  ```javascript
  headers: [
    {
      key: 'Cross-Origin-Opener-Policy',
      value: 'same-origin',
    },
    {
      key: 'Cross-Origin-Embedder-Policy',
      value: 'require-corp',
    },
  ]
  ```
- 如果修改了 `next.config.mjs`，必须**重启服务器**才能生效。

### 4.2 API 调用
- 项目目前使用**前端直连** (Frontend Direct Calls) 调用 OpenAI/Laozhang API。
- 这意味着 API Key 是暴露在浏览器端的（这也是为什么需要 `dangerouslyAllowBrowser: true`）。
- 请勿将包含真实 API Key 的 `.env.local` 提交到 Git。

## 5. 常见问题排查

- **报错 `ERR_ABORTED 404`**: 这里的 `.next` 构建文件损坏。执行 `rm -rf .next` 后重启。
- **报错 `API Key missing`**: 检查 `.env.local` 是否存在，且变量名是否为 `NEXT_PUBLIC_LAOZHANG_API_KEY`。
- **视频生成一直转圈**: 打开浏览器控制台 (Console)，检查是否有红色报错。如果是 `SharedArrayBuffer` 错误，检查 `next.config.mjs` Headers 配置。
- **Git 推送被拒绝 (`non-fast-forward`)**: 可能是因为回滚过代码。如果确认本地版本正确，使用 `git push origin main --force`。

## 6. 常用命令速查

| 动作 | 命令 |
| :--- | :--- |
| 安装依赖 | `npm install` |
| 启动开发服务器 | `npm run dev` |
| 构建生产版本 | `npm run build` |
| 强制推送到远程 | `git push origin main --force` |

