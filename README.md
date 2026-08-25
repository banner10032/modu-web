# 织卷 Web

织卷是个人单设备使用的本地优先 AI 长篇小说生成与阅读应用。本版本从 Android（Kotlin + Jetpack Compose）重构为 Web（React + TypeScript + Vite）。

## 功能

- **书库**：多项目管理、创建、删除、导出/导入备份
- **创作**：五字段建书（书名/题材/主角/基调/核心设定）+ 16 种题材预设 + 叙事尺度 + 剧情节奏
- **生成**：AI 逐章生成（正文流式 + 结构化结算），可选 1/2/3 章顺序续写
- **阅读**：Markdown 正文阅读、章节目录、上下章导航、字号/行距/主题设置、阅读位置记忆
- **Provider 设置**：多组 OpenAI 兼容配置（DeepSeek/通义千问/智谱 GLM/Kimi/自定义），API Key 本机加密
- **写作质量卡**：导入 .md/.json 创作规则，安全过滤，影响后续正文写法

## 技术栈

- React 19 + TypeScript + Vite
- IndexedDB 本地存储（替代文件系统）
- Web Crypto API 加密 API Key（替代 AndroidKeyStore）
- fetch + ReadableStream 流式 SSE（替代 OkHttp + okio）
- 本地优先：无账号、无服务端、无云同步

## 架构

```
src/
├── core/           # 纯领域逻辑（无浏览器依赖）
│   ├── domain.ts          # 领域模型：项目/章节/计划/结算/状态
│   ├── provider-contract.ts # Provider 协议、预设、校验、错误码
│   ├── continuity.ts       # 上下文构建器 + 连续性校验
│   ├── generation-coordinator.ts # 章节生成协调器（正文+结算两次调用）
│   ├── generation-job.ts   # 生成任务、恢复审计
│   ├── sequential-batch.ts # 1-3 章顺序批量
│   └── fake-provider.ts    # 测试用 Fake Provider
├── data/           # 持久化 + Provider 实现
│   ├── idb-repository.ts   # IndexedDB 仓储
│   ├── idb-job-store.ts    # IndexedDB 任务存储
│   ├── openai-provider.ts # OpenAI 兼容 Provider（fetch + SSE）
│   ├── provider-storage.ts # Provider 配置存储（localStorage）
│   ├── secret-store.ts     # API Key 加密存储（Web Crypto）
│   ├── writing-skill.ts    # 写作质量卡解析器
│   ├── project-archive.ts  # 项目导出/导入
│   └── crypto.ts           # SHA-256、Base64、ID 生成
├── ui/             # React UI
│   ├── App.tsx            # 主应用、路由、状态管理
│   ├── store.tsx           # Context + Reducer 状态
│   ├── theme.ts           # 暖纸色/石墨/朱砂/苔绿主题系统
│   ├── presets.ts         # 建书预设数据
│   ├── components.tsx     # 通用编辑式组件
│   └── pages/             # 四路由页面
│       ├── LibraryPage.tsx
│       ├── CreateProjectPage.tsx
│       ├── ProviderSettingsPage.tsx
│       ├── GenerationPage.tsx
│       └── ReaderPage.tsx
└── test/           # Vitest 测试
```

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 开发服务器
npm run build      # 生产构建
npm run test       # 运行测试
```

## 与 Android 版对应关系

| Android (Kotlin)          | Web (TypeScript)              |
|--------------------------|-------------------------------|
| `:core` 模块              | `src/core/`                   |
| `:data` 模块              | `src/data/`                   |
| `:app` (Jetpack Compose)  | `src/ui/` (React)             |
| 文件系统存储               | IndexedDB                     |
| AndroidKeyStore           | Web Crypto AES-GCM             |
| OkHttp + SSE              | fetch + ReadableStream         |
| SharedPreferences         | localStorage                   |
| 4 路由 Compose Navigation | 4 路由状态切换                  |
