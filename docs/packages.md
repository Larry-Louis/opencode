# OpenCode v2 包清单

> 全部信息以仓库实际代码为准（`git ls-files` + 各包 `package.json` + `src/` 入口）。
> 标「未确认」的字段表示我没有在源码里找到确凿依据，**不要当成已知事实**。
> 测试数 = 仓库跟踪的 `*.test.ts` / `*.test.tsx` / `*.spec.ts` 文件数（含 `e2e/`，用于横向对比，不是断言条数）。

版本号：除标注外均为 `2.3.0`（`packages/script` 与 `packages/stories` 无 `version` 字段）。

---

## 0. 先说清楚：41 个目录里哪些是真包

`git ls-files` 显示以下目录 **没有任何被跟踪的源文件**，只有本地 `node_modules/`（安装残留），**不是 workspace 包**：

`console`、`stats`、`enterprise`、`function`、`gui-extensions`、`posts`、`storybook`、`web`

另有两个「目录存在但不是常规包」：

- `identity`：只有 6 个品牌图片（`mark.svg`、`mark-*.png`），无 `package.json`。
- `effect-drizzle-sqlite`：只剩 1 个示例迁移 SQL，实现已并入 `packages/core/src/database/drizzle/`。

`plugins`、`data` 是**聚合目录**，真正的包在下一层（`plugins/figma`、`data/{app,core,server}`）。

---

## 1. 速查表

| 包名 | 目录 | 入口 | 内部依赖 | 测试数 |
| --- | --- | --- | --- | --- |
| `@opencode/ai` | `packages/ai` | `src/index.ts` | schema, http-recorder | 169 |
| `@opencode/app` | `packages/app` | `src/index.ts` | client, schema, gui-plugins, plugin, session-ui, ui, util | 430 |
| `@opencode/cli` | `packages/cli` | `src/index.ts` | client, plugin, pty, schema, server, tui, util, script, protocol | 58 |
| `@opencode/client` | `packages/client` | `src/promise/index.ts` | schema, protocol, httpapi-codegen | 25 |
| `@opencode/codemode` | `packages/codemode` | `src/index.ts` | 无 | 43 |
| `@opencode/core` | `packages/core` | `src/*.ts`（无 index） | pty, ai, codemode, plugin, plugin-browser, schema, util, http-recorder | 322 |
| `@opencode/data-app` | `packages/data/app` | `src/`（SolidStart） | nav-menus, data-core, ui | 见 data |
| `@opencode/data-core` | `packages/data/core` | `src/index.ts` | 无 | 见 data |
| `@opencode/data-server` | `packages/data/server` | `src/worker.ts` | data-core | 见 data |
| `@opencode/desktop` | `packages/desktop` | `out/main/index.js`（`src/main/index.ts`） | app, gui-plugins, plugin, client, schema, ui | 73 |
| `@opencode/gui-plugins` | `packages/gui-plugins` | `src/main.ts` / `src/renderer.ts` | client, plugin, plugin-browser, schema, session-ui, ui, util, protocol | 112 |
| `@opencode/http-recorder` | `packages/http-recorder` | `src/index.ts` | 无 | 4 |
| `@opencode/httpapi-codegen` | `packages/httpapi-codegen` | `src/index.ts` | 无 | 2 |
| `@opencode/latex` | `packages/latex` | `src/plugin.ts` / `src/markdown.ts` | plugin | 6 |
| `@opencode/merman` | `packages/merman` | `src/plugin.ts` / `src/markdown.ts` | plugin | 23 |
| `@opencode/nav-menus` | `packages/nav-menus` | `src/index.ts` | 无 | 1 |
| `@opencode/patchmark` | `packages/patchmark` | `src/index.ts` | 无 | 4 |
| `@opencode/plugin` | `packages/plugin` | `src/promise/index.ts` 等 4 入口 | ai, client, protocol, schema, util, theme | 4 |
| `@opencode/plugin-browser` | `packages/plugin-browser` | `src/index.ts` | plugin, schema | 6 |
| `@opencode/plugin-figma` | `packages/plugins/figma` | `index.ts` | 无 | 0 |
| `@opencode/pty` | `packages/process-daemon/npm` | `index.js`（Rust crate 产物） | 无 | Rust 测试 |
| `@opencode/protocol` | `packages/protocol` | `src/*.ts`（无 index） | schema | 5 |
| `@opencode/schema` | `packages/schema` | `src/index.ts` | 无 | 18 |
| `@opencode/script` | `packages/script` | `src/index.ts` | 无 | 2 |
| `@opencode/sdk` | `packages/sdk` | `src/index.ts` | client, core, plugin, schema, server, util, ai, httpapi-codegen, protocol | 11 |
| `@opencode/server` | `packages/server` | `src/*.ts`（无 index） | core, protocol, schema, simulation, util, pty, client, plugin | 46 |
| `@opencode/session-ui` | `packages/session-ui` | `src/actions.ts` 等 | client, patchmark, ui, util | 85 |
| `@opencode/simulation` | `packages/simulation` | `src/backend/index.ts` 等 | core, ai, plugin, protocol, util | 9 |
| `@opencode/stories` | `packages/stories` | `index.html` + `src/main.ts` | client, session-ui, ui | 0（Playwright 用） |
| `@opencode/theme` | `packages/theme` | `src/tui/index.ts` | 无 | 1 |
| `@opencode/tui` | `packages/tui` | `src/index.tsx` | client, core, latex, merman, plugin, schema, simulation, theme, ui, util | 197 |
| `@opencode/ui` | `packages/ui` | 每组件一个子路径 | util | 44 |
| `@opencode/util` | `packages/util` | `src/*.ts`（无 index） | 无 | 21 |

---

## 2. 逐包说明

### `@opencode/ai` — `packages/ai`

- **定位**：模型供应商适配层。请求/流式解析、协议族（chat / responses / messages / images / embeddings / speech / transcription / video / decisions）、Provider 注册、错误分类、Code Mode 之外的工具运行时雏形。
- **入口**：`src/index.ts`。子路径导出非常多：`./effect`（Effect 化客户端）、`./testing`、`./experimental`、`./route`、`./providers/*`（约 40 家厂商，含 `/chat`、`/responses`、`/images`、`/embeddings`、`/decisions` 等子协议）、`./protocols/*`（openai-chat、openai-responses、google-images…）。
- **主要导出**：`LLM`、`Media`、`Image`、`Embedding`、`Decision`、`Speech`、`Transcription`、`Video`、`RequestExecutor`、`AIError`（`Transport` / `InvalidProviderOutput` / `InvalidRequest`）、`isContextOverflowFailure`、`Generation`/`Snapshot` 类型。
- **关键内部依赖**：`@opencode/schema`（数据类型）、`@opencode/http-recorder`（录制/回放 HTTP 与 WebSocket）。
- **测试**：有，169 个测试文件；`test` 脚本带 `--timeout 30000`；另有 `setup:recording-env`。

### `@opencode/app` — `packages/app`

- **定位**：Solid 单页应用 + PWA，同时是 CLI 嵌入的 Web UI 与桌面端渲染层。
- **入口**：`src/index.ts`（导出 `AppBaseProviders`、`AppInterface`、`preloadRoute`、`PlatformProvider`、`ServerConnection`）；`src/entry.tsx` 是浏览器入口；`src/desktop.ts` 是桌面端专用导出面；`./vite` 导出 `vite.js`（供其它包复用 Vite 配置）。
- **主要导出**：上述三个 + `Platform`/`FatalRendererErrorLog` 类型 + `ServerConnection` 注册表；`src/runtime/*`（platform/pwa/i18n/persistence/plugin/server）、`src/shell/*`（tabs、commands、routes、state）、`src/session`、`src/composer`、`src/settings`、`src/workspaces`、`src/voice`、`src/hud`。
- **关键内部依赖**：`client`、`session-ui`、`ui`、`gui-plugins`、`plugin`、`schema`、`util`。**不依赖 core/server**。
- **测试**：有，430 个文件（含 `e2e/`）。`test` = 单测（`--conditions=solid` + happy-dom + 预加载 `../ui/test/solid-jsx.ts`）+ 浏览器条件单测；e2e / 组件 / service-worker / stability 各有独立 Playwright 配置。

### `@opencode/cli` — `packages/cli`

- **定位**：唯一可执行的进程入口：命令树、TUI 启动、backend 服务拉起/serve、Web UI 静态资源、Bun 编译打包。
- **入口**：`src/index.ts`；npm bin 是 `./bin/opencode.cjs` 与 `./bin/opencode2.cjs`（后者转发前者）。
- **主要导出**：`./vite-host`（`dev/host.js`，开发用 vite host）、`./server-process`（`src/server-process.ts`，供 sdk/desktop 复用进程启动逻辑）。
- **关键内部依赖**：`server`、`tui`、`client`、`plugin`、`schema`、`util`、`protocol`、`script`（构建期）、`@opencode/pty`。**不直接依赖 `core`**。
- **测试**：有，58 个文件；`test` 脚本 `bun test --timeout 30000 --only-failures`。

### `@opencode/client` — `packages/client`

- **定位**：类型安全的 HTTP 客户端（由 protocol 生成）+ 本地服务发现/拉起 + Solid 侧数据层。
- **入口**：`"."` → `src/promise/index.ts`；另有 `./promise`、`./promise/api`、`./service`、`./solid`、`./effect`、`./effect/api`、`./effect/service`、`./mcp`。
- **主要导出**：`OpenCode`（工厂：`OpenCode.make({ baseUrl, headers })`）、生成的分组客户端（`session`、`message`、`model`、`provider`、`event`、`rpc`、`pty`…）、`mediaHashFromUri`/`withMediaRefs`、`EventSubscribeOutput as OpenCodeEvent`；`./service` 里是 `Endpoint`、`EnsureReason`、`Info`、`ensure()` 等本地服务控制面；`./solid` 是 Solid 资源封装。
- **关键内部依赖**：`schema`、`protocol`、`httpapi-codegen`（生成器）。**禁止依赖 core/server**。
- **生成物**：`src/promise/generated`、`src/effect/generated`、`src/effect/api`，由 `bun run generate` 产出；`check:generated` 用 `git diff --exit-code` 保证与源码同步。
- **测试**：有，25 个文件。

### `@opencode/codemode` — `packages/codemode`

- **定位**：Code Mode —— 把工具集合暴露成一段可执行的 JS 程序（解释器 + VM + 快照 + OpenAPI 标准库），让模型写代码而不是逐个调用工具。
- **入口**：`src/index.ts`。
- **主要导出**：`CodeMode`、`Extension`、`Namespace`、`Tool`、`OpenAPI`、`fromBytes`/`toBytes`、`searchSignature`、`toolExpression`、`SnapshotError`、`SuspendError`、`ToolError`、`Outcome`/`Program`/`Runtime`/`Snapshot` 类型。
- **关键内部依赖**：无（零内部依赖，是独立子系统）。`interpreter/` 与 `stdlib/` 里有 oxlint 规则禁止直接 import `effect`。
- **测试**：有，43 个文件，另有 `test:roundtrip`（`CODEMODE_ROUNDTRIP=1`）。

### `@opencode/console` — `packages/console`

- **定位**：**不存在**。目录下只有 `app/`、`function/`、`resource/` 三个子目录，每个都只有 `node_modules/` 或 `.turbo/`，`git ls-files packages/console` 为 0。
- **入口 / 导出 / 依赖 / 测试**：未确认（推测是已删除的 Cloudflare 控制台应用，历史残留）。

### `@opencode/core` — `packages/core`

- **定位**：领域核心。会话与执行、模型与 Provider、工具注册与执行、权限、插件宿主、配置、文件系统/VCS/PTY、SQLite 持久化与事件溯源，全在这里。
- **入口**：没有 index；`exports` 为 `{"./*": "./src/*.ts"}`，用方按模块引用（`@opencode/core/session`、`@opencode/core/tool`、`@opencode/core/bus`、`@opencode/core/config`…）。
- **主要导出**（按目录）：`Session`、`SessionRunner`、`SessionStep`、`SessionStore`、`SessionExecution`、`Bus`、`EventLogger`、`Tool`、`ToolOutput`、`ToolOutput`、`Provider`、`Model`、`ModelResolver`、`ModelRetry`、`Permission`、`Plugin`（含 `PluginHooks`）、`Config`、`Database`、`EffectDrizzleSqlite`、`FileSystem`、`Snapshot`、`Vcs`、`Worktree`、`Workspace`、`Project`、`Location*`、`Instance`、`Job`、`Schedule`、`Mcp`、`Skill`、`Command`、`Agent`、`Instructions`、`CodeMode*`、`Image`、`Ripgrep`、`Shell`、`Pty`、`PersistentPty`、`Rpc`、`WebSearch`、`Usage*`、`Integration`、`Credential`、`Oauth`、`Flag`。
- **关键内部依赖**：`ai`、`codemode`、`plugin`、`plugin-browser`、`schema`、`util`、`http-recorder`、`@opencode/pty`。
- **构建**：`script/build.ts` 先 `tsc -p tsconfig.build.json`，再 `bun build`（`packages: "external"`，把 `#sqlite`、`#pty`、`#photon-wasm`、`#v1-migration` 等条件导入保留为外部）。
- **测试**：有，322 个文件 + `test/` 目录 + `perf/`；`test` 脚本是 `script/test.ts`，会构造临时 HOME/XDG 并过滤凭据类环境变量。

### `data`（聚合目录）— `packages/data`

- **定位**：OpenCode Data 站点（opencode.ai/data），三个子包，`services/data` 负责部署成 Cloudflare Workers。
- **`@opencode/data-core`**（`packages/data/core`）：Effect 服务 + app config + Drizzle schema/migration + 数据域 + R2 SQL。入口 `src/index.ts`，子路径 `./config`、`./database`、`./database/*`、`./domain/*`、`./r2-sql`、`./resource`、`./runtime`、`./stat-sync`、`./sync-range`。内部依赖：无。
- **`@opencode/data-app`**（`packages/data/app`）：SolidStart 前端站点。入口 `src/`（`app.config.ts`、`vite.config.ts`）。依赖 `nav-menus`、`data-core`、`ui`。
- **`@opencode/data-server`**（`packages/data/server`）：`DataSyncWorkflow`、cron handler、本地 sync 脚本。文件 `src/{worker,cron,schedule,sync,workflow}.ts`。依赖 `data-core`。
- **测试**：三个子包合计 14 个测试文件（`cron.test.ts`、`schedule.test.ts` 等）。

### `@opencode/desktop` — `packages/desktop`

- **定位**：Electron 桌面应用。主进程负责窗口/协议/单实例锁/侧车服务探测，渲染器复用 `@opencode/app`，CLI 二进制作为 sidecar 打包进去。
- **入口**：`package.json` 的 `main` 是 `./out/main/index.js`（electron-vite 产物）；源码入口 `src/main/index.ts`；另有 `src/preload/`、`src/renderer/`、`src/shared/`。
- **主要导出**：无 `exports` 字段（应用而非库）。
- **关键内部依赖**：`app`、`gui-plugins`、`plugin`、`client`、`schema`、`ui`。
- **脚本**：`dev`（`script/dev.ts`，会设 `OPENCODE_CHANNEL=local`、可选本地构建或下载 dev/beta CLI）、`build`（`script/build.ts`）、`pack`（electron-builder）、`preview`、`migration`。
- **测试**：有，73 个文件；`test` 为 `bun test --timeout 30000`，`turbo.json` 里显式 `cache: false`。

### `@opencode/effect-drizzle-sqlite` — `packages/effect-drizzle-sqlite`

- **定位**：**已不再是独立包**。目录下只有 `examples/migrations/20240101000000_create_users/migration.sql`，无 `package.json`。
- **现状**：实现位于 `packages/core/src/database/drizzle/`（`drizzle/index.ts` 导出 `EffectLogger`、`./effect-sqlite/driver.js`、`./effect-sqlite/session.js`，并 `export * as EffectDrizzleSqlite`）。
- **入口 / 依赖 / 测试**：未确认（历史包已合并）。

### `@opencode/enterprise` — `packages/enterprise`

- **定位**：**不存在**。只有 `node_modules/`，`git ls-files` 为 0。
- **入口 / 导出 / 依赖 / 测试**：未确认。`node_modules` 里有 `hono`、`nitro`、`@cloudflare` 等，推测曾是 Cloudflare/边缘应用。

### `@opencode/function` — `packages/function`

- **定位**：**不存在**。只有 `node_modules/`，`git ls-files` 为 0。
- **入口 / 导出 / 依赖 / 测试**：未确认。

### `@opencode/gui-extensions` — `packages/gui-extensions`

- **定位**：**不存在**。只有 `node_modules/`，`git ls-files` 为 0。
- **入口 / 导出 / 依赖 / 测试**：未确认。

### `@opencode/gui-plugins` — `packages/gui-plugins`

- **定位**：内置 GUI 插件集合（主进程侧 + 渲染器侧各一套入口）。
- **入口**：`./main` → `src/main.ts`、`./renderer` → `src/renderer.ts`、`./terminal` → `src/terminal/index.ts`、`./debug/options` → `src/debug/options.ts`。
- **主要导出**：`builtins`（`compose({...})` 出来的内置插件表，按 id 列出：context、btw、debug、terminal、file、review、details、browser、pairing、updater、ssh、wsl、microsoft-office、sources、goal），渲染器侧 `compose` 出来的渲染表。
- **关键内部依赖**：`plugin`（`/gui/host` 契约）、`plugin-browser`、`client`、`schema`、`session-ui`、`ui`、`util`、`protocol`。
- **约束**：oxlint 规则禁止 `gui-plugins` 与 `plugin/src/gui` import `@opencode/app`/`@opencode/desktop`/`@/`（app 内部路径），也禁止跨插件直接 import（只能走对方的 `contract.ts`）。
- **测试**：有，112 个文件。

### `@opencode/http-recorder` — `packages/http-recorder`

- **定位**：HTTP 与 WebSocket 的 cassette 录制/回放层，供测试与仿真使用。
- **入口**：`src/index.ts`。
- **主要导出**：`HttpRecorder.layer(name, options)`（包住 `HttpClient`）、`layerFetch`、`layerSocket`、`layerWebSocketConstructor`、`hasCassetteSync`/`removeCassetteSync`。
- **依赖**：无内部依赖。
- **测试**：有，4 个；另外 `verify:package` 校验打包产物。

### `@opencode/httpapi-codegen` — `packages/httpapi-codegen`

- **定位**：从 Effect HttpApi 生成客户端代码的编译器。
- **入口**：`src/index.ts`。
- **主要导出**：`compile(...)`、`emitPromise`、`emitEffectImported`、`emitEffectShape`、`write`，以及 `Operation`/`OperationInputField` 等中间类型。
- **依赖**：无内部依赖（`effect`、`prettier` 为外部依赖）。
- **测试**：有，2 个。

### `@opencode/identity` — `packages/identity`

- **定位**：品牌素材目录，**不是包**（无 `package.json`）。文件：`mark.svg`、`mark-light.svg`、`mark-96x96.png`、`mark-192x192.png`、`mark-512x512.png`、`mark-512x512-light.png`。
- **入口 / 导出 / 依赖**：不适用。使用方：未确认（可能被 `services/site` 或桌面图标脚本取用）。

### `@opencode/latex` — `packages/latex`

- **定位**：TUI 里的 LaTeX/math 代码块渲染插件（基于 `@opentui/core` 的 markdown 渲染钩子）。
- **入口**：`./markdown` → `src/markdown.ts`、`./plugin` → `src/plugin.ts`（默认导出 `Plugin.define({ id: "opencode.latex" })`）。
- **主要导出**：`createLatexCodeBlockRenderer(renderer, colors)`、`LatexOptions`、`LatexParseError`、`MathLayout`；插件注册 `latex` 与 `math` 两个代码块渲染器。
- **关键内部依赖**：`plugin`（`@opencode/plugin/tui`）。
- **测试**：有，6 个。

### `@opencode/merman` — `packages/merman`

- **定位**：Mermaid 图（flowchart / gantt 等）的终端渲染器 + TUI 插件。
- **入口**：`./markdown`、`./palette`、`./plugin`。
- **主要导出**：`createMermaidCodeBlockRenderer`、`resolveOpenCodeDiagramPalette`、`MermaidSyntaxError`、`DiagramCanvasSizeError`、`detectMermaidDiagram`、各图形 parser/drawing/style；插件 id `opencode.merman`。
- **关键内部依赖**：`plugin`。
- **测试**：有，23 个；另有 `audit:layouts` 布局审计脚本。

### `@opencode/nav-menus` — `packages/nav-menus`

- **定位**：所有 OpenCode 站点（opencode.ai、docs、Data、Console、status）共用的导航菜单，框架无关。
- **入口**：`src/index.ts` + CSS 子路径导出 `./nav-menus.css`。
- **主要导出**：`installNavMenus()`、`brandSvgs`，以及一段详细的行为契约注释（`data-nav-logo`、`data-nav-product`、`data-nav-name` 标记、事件 `opencode-nav-menu-open`、`--nav-menu-*` 变量）。
- **依赖**：无内部依赖。
- **测试**：有，1 个。

### `@opencode/patchmark` — `packages/patchmark`

- **定位**：增量式 markdown 解析器（为流式输出设计）：解析块/行内、打补丁、修复流式尾巴，并能渲染成 HTML。
- **入口**：`src/index.ts`。
- **主要导出**：`parseInlines`、`renderBlocksToHtml`、`renderBlockKindToHtml`、`renderInlinesToHtml`、`escapeHtml`、`healStreamingInline`、`computeTailHeal`/`applyTailHeal`、`createMarkdownStream`/`PatchmarkStream`/`splitPendingMarker`、`StreamFrame`/`MarkdownBlock` 等类型。
- **依赖**：无内部依赖。
- **测试**：有，4 个；另有 `fuzz`（`scripts/fuzz-differential.ts`）；`typecheck` 直接用 `tsc --noEmit`。

### `@opencode/plugin` — `packages/plugin`

- **定位**：插件 SDK 与宿主契约（四种形态：promise / effect / tui / gui），以及插件发现、存储、RPC、运行时模块加载。
- **入口**：`"."` → `src/promise/index.ts`、`./effect` → `src/effect/index.ts`、`./host`、`./runtime`、`./tui`、`./gui`、`./gui/main`、`./gui/host`、`./gui/builtin`、`./gui/file`、`./gui/review`、`./gui/browser`、`./gui/updater`、`./gui/vite`，以及 `./*` → `src/*.ts`（`./runtime-modules` 等）。
- **主要导出**：`Plugin.define({ id, setup | effect })`、`compose`、`PluginHooks` 相关类型、`rpc.ts` 的 RPC 契约、`storage.ts`、`source.{bun,node,package}.ts` 的插件来源解析、`runtime-modules.ts` 的 specifier 表。
- **关键内部依赖**：`ai`、`client`、`protocol`、`schema`、`util`、`theme`。
- **测试**：有，4 个。
- **注意**：`src/gui/**` 被 oxlint 禁止 import `app`/`desktop`/`gui-plugins`/`@/`。

### `@opencode/plugin-browser` — `packages/plugin-browser`

- **定位**：浏览器自动化插件（作为 core 插件加载，注册 browser 工具）。
- **入口**：`"."` → `src/index.ts`（默认导出 `Plugin.define({ id: "opencode.browser" })`）、`./rpc`、`./proxy`。
- **主要导出**：插件定义、`BrowserConnection`、`BrowserTools.register`、RPC/proxy 契约。
- **关键内部依赖**：`plugin`（`@opencode/plugin/effect`）、`schema`。
- **测试**：有，6 个。

### `plugins`（聚合目录）— `packages/plugins`

- **定位**：外部/官方插件包的容器，目前只有 `figma`；另有 `README.md`。

#### `@opencode/plugin-figma` — `packages/plugins/figma`

- **定位**：Figma 官方插件包（带一组 skills，由 `skills-source.json` 同步）。
- **入口**：`index.ts`（`"."` 与 `./server` 都指向它）。
- **主要导出**：未确认（只读了 manifest 与目录结构）。
- **依赖**：无内部依赖。
- **测试**：无测试脚本；有 `sync:skills`。

### `@opencode/posts` — `packages/posts`

- **定位**：**不存在**。只有 `.turbo/` 与 `node_modules/`，`git ls-files` 为 0。
- **入口 / 导出 / 依赖 / 测试**：未确认（名字暗示曾是博客/文章包）。

### `packages/process-daemon` — Rust crate `opencode-pty` / npm `@opencode/pty`

- **定位**：**不是 TypeScript 包**。实验性的线程化 PTY 服务核心：用 `portable-pty` 管理终端子进程，用 `libghostty-vt` 维护权威终端状态、回答终端协议查询；每个终端有独立的 blocking I/O 与 actor 线程。
- **入口**：
  - Rust：`src/main.rs`（`opencode-pty daemon --name NAME`）、`src/lib.rs`；模块 `daemon/`、`ghostty/`、`service/`、`transport/`。
  - npm 包：`npm/package.json`（`@opencode/pty` v0.5.2），`index.js` + `index.d.ts` + `bin/opencode-pty.js`，通过 8 个 `optionalDependencies`（`@opencode/pty-<os>-<arch>[-gnu|-musl]`）分发二进制。
- **主要导出**：npm 侧 `binaryPath`；协议为「认证帧 + JSON 请求」，支持 `own` / `prepare_handoff` / `handoff` / `shutdown` / `read_rows` / 订阅等操作（protocol 8）。
- **关键内部依赖**：无（Rust 依赖 `portable-pty`、`windows-sys`、`nix`、`libghostty-vt`；构建时由 `build.rs` 拉取并编译 Ghostty）。
- **测试**：Rust 测试（`cargo test`，含 `tests/runtime.rs`、`tests/windows-daemon.rs`、Miri 下的 `tests/ghostty-effects`），由 `.github/workflows/check-process-daemon.yml` 在 Windows x64/ARM64 上跑。

### `@opencode/protocol` — `packages/protocol`

- **定位**：HTTP API 的形状定义（不含实现）：group、endpoint、payload/response schema、中间件放置、OpenAPI 注解，以及 `simulation` 变体。
- **入口**：无 index；`exports` = `{"./simulation": "./src/simulation.ts", "./*": "./src/*.ts"}`。核心文件 `src/api.ts`（`makeApi` / `makeDefaultApi`）。
- **主要导出**：`makeApi`、`makeDefaultApi`、`Api` 类型、`./groups/*`（约 38 个 group：session、message、model、provider、permission、fs、pty、shell、vcs、worktree、mcp、plugin、rpc、event、config、credential、project、usage、websearch、generate、voice、migration、debug…）、`./middleware/authorization`、`./middleware/schema-error`、`./client`、`./errors`。
- **关键内部依赖**：`schema`。
- **测试**：有，5 个（含 `test/experimental-identifiers.test.ts` 强制 experimental 路径与 identifier 双向一致）；另有 `generate`（OpenAPI）与 `check:generated`。

### `@opencode/schema` — `packages/schema`

- **定位**：唯一的共享数据类型层：Effect Schema 定义 + 配置 flag 定义。
- **入口**：`src/index.ts`（重新导出约 60 个模块）+ `"./*": "./src/*.ts"`。
- **主要导出**：`Agent`、`Artifact`、`Command`、`Config`、`Connection`、`Credential`、`Event`、`EventLog`、`FileSystem`、`Form`、`Integration`、`LLM`、`Location`、`Mcp`、`Model`、`Money`、`Permission`、`PermissionSaved`、`Project`、`Provider`、`Reference`、`Rpc`、`Session`、`SessionMessage`、`SessionInbox`、`SessionError`、`SessionStats`、`Skill`、`Snapshot`、`Prompt`、`PromptInput`、`Tool`、`TokenUsage`、`UsageLimits`、`Vcs`、`Worktree`、`Workspace`、`WebSearch` 等；`src/config/flag.ts` 是功能开关表。
- **关键内部依赖**：无。
- **测试**：有，18 个。

### `@opencode/script` — `packages/script`

- **定位**：构建/发布脚本共享工具：Bun 版本断言、channel/version 解析、团队名单、打包工具。
- **入口**：`src/index.ts`（导出 `Script` 对象，含 `channel`、`version`、`preview`、`team`）、`./highlights`、`./pack`（`npmDir`、`archiveDir` 等）。
- **主要导出**：`Script`、`embed`（release notes 高亮）、`npmDir`/`archiveDir`。
- **依赖**：无内部依赖。
- **测试**：有，2 个。
- **注意**：`package.json` 没有 `version` 字段；被根 `pack` 脚本正则改写版本时会绕过它。

### `@opencode/sdk` — `packages/sdk`

- **定位**：把 Client + Core + Server 组合成可嵌入 SDK 的「组合根」，含 workerd 入口。
- **入口**：`"."` → `src/index.ts`、`./effect` → `src/effect/index.ts`、`./workerd` → `src/workerd.ts`、`./workerd/effect` → `src/effect/workerd.ts`。
- **主要导出**：`OpenCode`（`create`、`Interface`、`CreateOptions`…）、`Tool`、`ClientError`、`contracts`、`logging`。
- **关键内部依赖**：`client`、`core`、`plugin`、`schema`、`server`、`util`、`ai`、`httpapi-codegen`、`protocol`。
- **测试**：有，11 个；另有 `verify:package`。

### `@opencode/server` — `packages/server`

- **定位**：HttpApi 的运行时实现：把 protocol 的 endpoint 接到 core 服务，组装服务图，并提供 Node 与 workerd 两种宿主。
- **入口**：无 index；`exports` = `{"./*": "./src/*.ts"}`。关键文件：`src/api.ts`、`src/routes.ts`、`src/fetch.ts`、`src/handlers.ts`、`src/handlers/*`（37 个文件）、`src/middleware/*`、`src/event-feed.ts`、`src/location.ts`、`src/auth.ts`、`src/cors.ts`、`src/pairing.ts`、`src/workerd.ts`、`src/service-status.ts`。
- **主要导出**：`Api`、`make`（web-standard fetch handler）、`handlers`（Layer）、`createRoutes`、`EventFeed`、`LocationMiddleware`、`ServerOptions` 等。
- **关键内部依赖**：`core`、`protocol`、`schema`、`simulation`、`util`、`pty`、`client`、`plugin`。
- **测试**：有，46 个；另有 `probe:workerd`（`script/workerd-probe.ts`）。

### `@opencode/session-ui` — `packages/session-ui`

- **定位**：会话渲染层（TUI 与 Web/桌面共用的会话视图逻辑与组件）。
- **入口**：没有 `"."`；导出面很细：`./actions`、`./document`、`./message`、`./timeline`、`./timeline/projection`、`./timeline/detail`、`./timeline/row`、`./timeline-next`、`./basic-tool`、`./copy`、`./dock-prompt`、`./file`、`./file-media`、`./file-search`、`./linked-text`、`./line-comment*`、`./markdown`、`./markdown-stream`、`./markdown-cache`、`./message-part`、`./message-nav`、`./session-review`、`./session-retry`、`./session-diff`、`./tool-*`、`./pierre/*`、`./context/*`、`./sources/*`、`./tools/*`、`./v2/*`、`./styles`。
- **主要导出**：`SessionDocument`、`SessionUserComment`、`SessionTimeline`、`CurrentMessage`、`MessagePart`、markdown 渲染、pierre diff/highlight 封装、`sources`（引用来源面板）。
- **关键内部依赖**：`client`、`patchmark`、`ui`、`util`。
- **测试**：有，85 个；另有 `test:components`（Playwright）。

### `@opencode/simulation` — `packages/simulation`

- **定位**：端到端仿真/录制：后端用模拟网络替换真实 provider（可录制回放），前端提供 headless 渲染与 control-server 的「drive」模式。
- **入口**：`./backend` → `src/backend/index.ts`、`./backend/*`、`./frontend` → `src/frontend/simulation.ts`、`./frontend/*`、`./protocol`、`./recording` → `src/recording.ts`。另有 `src/control-server.ts`、`src/manifest.ts`。
- **主要导出**：`Layer replacements`（`SimulationNetwork`、`SimulationOpenAI`、`SimulatedProvider`）、`create`（drive renderer）、`DriveManifest`、录制格式。
- **关键内部依赖**：`core`、`ai`、`plugin`、`protocol`、`util`。
- **测试**：有，9 个。

### `@opencode/stats` — `packages/stats`

- **定位**：**不存在**。`app/`、`core/`、`server/` 三个子目录只有 `node_modules/`/`.turbo/`，`git ls-files` 为 0。
- **入口 / 导出 / 依赖 / 测试**：未确认（推测曾被 `services/*` 或 `packages/data` 取代）。

### `@opencode/stories` — `packages/stories`

- **定位**：组件 story 的独立 Vite 应用，供 Playwright 组件测试与人工浏览。
- **入口**：`index.html` + `src/main.ts`（另有 `src/lab.tsx`、`src/frame.tsx`、`src/providers.tsx`、`src/index-plugin.ts`、`src/plugin.tsx`）；`mocks/`、`playwright/` 目录。
- **主要导出**：无 `exports` 字段（私有应用，`"private": true`）。
- **关键内部依赖**：`client`、`session-ui`、`ui`。
- **测试**：无 `test` 脚本（`dev` = `vite --port 6006`）；测试由消费方的 Playwright components 配置驱动。

### `@opencode/storybook` — `packages/storybook`

- **定位**：**不存在**。只有 `node_modules/`，`git ls-files` 为 0（story 能力实际由 `packages/stories`、`packages/ui/src/storybook/`、`packages/session-ui/src/storybook/`、`packages/tui/src/feature-plugins/system/storybook` 承担）。
- **入口 / 导出 / 依赖 / 测试**：未确认。

### `@opencode/theme` — `packages/theme`

- **定位**：TUI 主题的 schema、默认值、解析与类型（语义化 token：hue、surface、markdown、syntax、action、formfield、feedback…）。
- **入口**：`./tui` → `src/tui/index.ts`、`./tui/v1` → `src/tui/v1.ts`。
- **主要导出**：`ThemeDefinition`、`ThemeDocument`、`BaseThemeDefinition`、`ModeDefinition`、`SurfaceName`、`HueName`、`HueStep`、`MarkdownToken`、`SyntaxToken`、`ActionState`/`ActionVariant`、`FormfieldState`、`FeedbackKind`、`CategoricalDefinition`。
- **依赖**：无内部依赖。
- **测试**：有，1 个。

### `@opencode/tui` — `packages/tui`

- **定位**：终端 UI（OpenTUI + Solid）：应用骨架、路由、提示词输入、命令面板、主题、storybook、mini 模式。
- **入口**：`"."` → `src/index.tsx`（导出 `run`、`TuiInput`、`LogProvider`/`useLog`）；子路径：`./config`、`./config/keybind`、`./config/v1`、`./config/v1/keybind`、`./plugin/discovery`、`./editor`、`./mini`、`./mini/tool`、`./model-preference`、`./util/form`、`./logo`、`./component/spinner`、`./component/spinner-renderable`。
- **主要导出**：`run(options)`（接收 app/server/args/config/updater/packages/environment/terminalHandoff/log 等回调，是 CLI 与 TUI 的唯一接口）、`TuiInput`、日志上下文。
- **关键内部依赖**：`client`、`ui`、`theme`、`plugin`、`schema`、`simulation`、`latex`、`merman`、`util`，以及 `core`（仅 `@opencode/core/util/slug`）。
- **测试**：有，197 个（OpenTUI renderer 测试）；测试规范见 `.opencode/skills/tui-tests`。

### `@opencode/ui` — `packages/ui`

- **定位**：框架级设计系统组件库（Solid），按组件一个导出路径。
- **入口**：没有 `"."`。约 60 个显式子路径（`./button`、`./dialog`、`./text-input`、`./textarea`、`./select`、`./menu`、`./tabs`、`./toast`、`./tooltip`、`./icon`、`./loader`、`./diff-changes`…）+ `"./*": "./src/components/*.tsx"` + `./styles`、`./styles/tokens`、`./theme`、`./theme/*`、`./hooks`、`./context`、`./storybook/{scaffold,fixtures}`、`./fonts/*`、`./audio/*`、图标 sprite 类型。
- **主要导出**：各组件、`src/icons/catalog.ts`、`src/theme/*`、`src/motion*`、i18n（`./i18n/*`）。
- **关键内部依赖**：`util`（唯一）。
- **测试**：有，44 个；另有 `test`（`bun test src`）与组件级 Playwright。

### `@opencode/util` — `packages/util`

- **定位**：无领域语义的通用工具：Effect 辅助（`layer-node`、`app-node`）、路径、glob、hash、base64、flock、retry、abort、process、npm、observability、runtime-import、session-mention 等。
- **入口**：无 index；`exports` = `{"./effect/layer-node": "./src/effect/layer-node.ts", "./*": "./src/*.ts"}`。
- **主要导出**：`Global`、`AppProcess`、`FSUtil`、`EffectFlock`、`Npm`、`Observability`、`LayerNode`、`Node`（app-node）、`HttpClient`/`httpClient`（app-node-platform）、`retry`、`abort`、`glob`、`path`、`hash`、`runtime-import`、`teardown`、`uuid`、`cross-spawn-spawner`、`binary`、`qr`、`record`、`session-turn`。
- **关键内部依赖**：无；但有几个运行时分支版本（`global-roots.ts` / `global-roots.workerd.ts`），通过条件导出切换。
- **测试**：有，21 个；另有 `typecheck:dist`（先 build 再对 `tsconfig.dist.json` 检查）。

### `@opencode/web` — `packages/web`

- **定位**：**不存在**。只有 `node_modules/`（里面有 `astro`、`@astrojs/*`、`shiki`、`toolbeam-docs-theme` 等），`git ls-files` 为 0。
- **入口 / 导出 / 依赖 / 测试**：未确认（推测是搬到 `services/site` 之前的 Astro 文档站）。

---

## 3. 信息不完整、需要人工补充的项

| 项 | 缺什么 | 建议动作 |
| --- | --- | --- |
| `console`、`stats`、`enterprise`、`function`、`gui-extensions`、`posts`、`storybook`、`web` | 无任何跟踪源码，只有 `node_modules/` 残留；不知道是已删除还是待恢复 | 确认后删除空目录，或在 README 注明「历史残留」 |
| `identity` | 无 `package.json`，不知道谁在消费这 6 个图片 | 查 `services/site`、桌面图标脚本、CI 中的引用 |
| `effect-drizzle-sqlite` | 只剩 1 个示例迁移，无 manifest | 删除该目录，或把 `packages/core/src/database/drizzle` 的说明补到 README |
| `plugins/figma` | 只看了 manifest 与目录，没有读 `index.ts` 的导出细节 | 读 `packages/plugins/figma/index.ts` 补全「主要导出」 |
| `tui` 的 `core` 依赖 | 全仓只用到 `Slug`，是否为有意设计未知 | 与维护者确认能否改为 `util` 内的实现 |
| `packages/web/node_modules` 内容 | `astro` 系列说明它曾是文档站，但迁移去向未确认 | 对照 `services/site` 的 git 历史 |
| `packages/script` 无 `version` | 根 `pack` 脚本用正则改写所有 `package.json` 的版本，该包会被跳过 | 确认是否有意 |
| `process-daemon` 的 npm 版本 | npm 包是 `0.5.2`，与 monorepo `2.3.0` 独立发版 | 已在 README 说明，无需补；仅提示版本号不一致是预期 |

---

## 4. 读包时发现的几个「不像表面那样」的点

1. **`core`、`protocol`、`server`、`util` 都没有 `index.ts`**，全部靠 `"./*": "./src/*.ts"` 按路径导出。`import { X } from "@opencode/core"` 是不存在的写法。
2. **`@opencode/ui` 也没有 `"."` 导出**，但额外有 `"./*": "./src/components/*.tsx"` 兜底，所以 `@opencode/ui/foo` 既可能命中显式路径也可能命中 components 目录，排查导入时容易误判。
3. **`@opencode/codemode` 零内部依赖**，却带一整套解释器/VM/stdlib/snapshot；它是被 core 单向使用的独立运行时。
4. **`@opencode/tui` 是 `packages/*` 里测试文件第二多的包**（197，仅次于 app 430 和 core 322），但它的公共导出只有 `run` + 两个日志 API —— 大量代码是内部路由/组件/storybook fixture。
5. **`@opencode/stories` 是私有 Vite 应用而不是 storybook**：目录名和 `packages/storybook`（空壳）容易让人以为仓库用 Storybook；实际 story 分散在 `ui/src/storybook`、`session-ui/src/storybook`、`tui/src/feature-plugins/system/storybook`。
6. **`@opencode/plugin` 一个包提供四套互不相同的插件契约**（promise / effect / tui / gui），且 `./gui/*` 下有 9 个子入口；阅读插件代码前必须先确定是哪一套宿主。
7. **`@opencode/server` 依赖 `@opencode/client`**：服务发现逻辑在 client，于是服务端反向引用客户端（详见 `docs/architecture-overview.md` 第 6 节）。
8. **测试脚本高度不一致**：`core` 走自定义 `script/test.ts`（临时 HOME + 过滤凭据），`patchmark` 直接用 `tsc --noEmit` 做 typecheck，`desktop` 在 turbo 里 `cache: false`，`stories` 根本没有 test 脚本。想「一条命令跑全仓测试」只能靠 `turbo run test`，且必须先满足 bun 版本 pin。
