# 迭代 29: 数据导入导出

**日期**: 2026-02-23
**方向**: SillyTavern 格式完整导入、角色卡 PNG 导入导出、聊天记录导出、批量操作

---

## 任务列表

### T1: 角色卡 PNG 导出 (服务端)
**文件**: `src/server/routes/characters.ts`, `src/server/utils/png-embed.ts` (新建)
- 创建 PNG 嵌入工具: 将角色 JSON 编码为 base64, 写入 PNG tEXt chunk (keyword: 'chara')
- 新增 GET /api/v1/characters/:id/export/png — 下载带嵌入 JSON 的 PNG 角色卡
- 如果角色有 avatarUrl (base64), 用作 PNG 基础图; 否则生成默认占位图
- 返回 Content-Disposition: attachment; filename="character-name.png"

### T2: 聊天记录导出 API
**文件**: `src/server/routes/chats.ts`
- 新增 GET /api/v1/chats/:id/export?format=json|txt
- JSON 格式: 完整聊天数据 (chat metadata + messages array)
- TXT 格式: 纯文本对话记录 (角色名: 消息内容, 每条消息一段)
- 权限检查: 只能导出自己的聊天

### T3: 批量角色导入 API
**文件**: `src/server/routes/characters.ts`
- 新增 POST /api/v1/characters/import/batch — 接受 multipart/form-data, 多个文件 (JSON/PNG)
- 服务端解析每个文件 (JSON 直接解析, PNG 提取 tEXt chunk)
- 验证每个角色卡格式, 批量创建
- 返回: { imported: number, failed: Array<{filename, error}> }
- 限制: 最多 20 个文件/次

### T4: 批量角色导出 API
**文件**: `src/server/routes/characters.ts`
- 新增 POST /api/v1/characters/export/batch — body: { characterIds: string[], format: 'json' | 'png' }
- JSON 格式: 返回 ZIP 包含多个 .json 文件
- PNG 格式: 返回 ZIP 包含多个 .png 文件 (带嵌入 JSON)
- 限制: 最多 50 个角色/次

### T5: 前端导入导出 UI
**文件**: `src/client/pages/MyCharacters.vue`, `src/client/components/chat/ChatWindow.vue`
- MyCharacters: 添加批量选择模式, 批量导出按钮 (JSON/PNG), 批量导入按钮 (拖拽多文件)
- ChatWindow: 添加导出聊天按钮 (JSON/TXT 格式选择)
- 导入进度条, 导出下载触发

### T6: i18n + 最终验证
- 添加 export/import i18n 键
- 运行 tsc, vitest, build
- 更新 ROADMAP.md
