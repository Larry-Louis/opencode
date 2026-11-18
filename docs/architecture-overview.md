# OpenCode v2 架构总览

> 本文档基于仓库实际源码（`package.json`、各包 `src/`、构建脚本）整理。版本 `2.3.0`，包管理器 `bun@1.4.4`，核心运行时为 Effect 4.1，前端为 Solid，桌面端为 Electron。
>
> 只描述已读到的代码行为；未确认的地方标注「未确认」。

---

## 1. 仓库形态

- Bun workspaces monorepo，workspace 通配为 `packages/*`、`packages/plugins/*`、`packages/data/*`、`services/*`。
- 根 `package.json` 中 41 个目录看似都是包，但实际只有一部分是真包，详见 `docs/packages.md`。
- 技术基线：
  - 运行时/构建：Bun（CLI 产物是 `bun build --compile` 的独立可执行文件）
  - 效果系统：Effect（`effect`、`@effect/*` 4.1.0），服务以 Layer/Context.Service 组织
  - 数据库：SQLite + Drizzle（`drizzle-orm` 1.0.0-rc），`#sqlite` 子路径按运行时切换 bun/node/workerd 实现
  - HTTP 层：Effect 的 `http` / `http-api`（HttpApi + HttpApiGroup + 中间件），OpenAPI 由 HttpApi 注解生成
  - 前端：Solid（App/Web/PWA、UI 组件、Session UI），TUI 用 OpenTUI（`@opentui/*`）
  - 桌面：Electron + electron-vite + electron-builder/NSIS

---

## 2. 分层与调用方向

### 2.1 层次总览

| 层 | 包 | 职责 |
| --- | --- | --- |
| 数据契约 | `@opencode/schema` | 纯 Effect Schema 定义：session、message、event、config、model、tool、permission、provider、pty…；以及 `config/flag.ts` 功能开关。无内部依赖。 |
| 协议 | `@opencode/protocol` | HttpApi 形状：group、endpoint、payload schema、中间件放置、OpenAPI 注解、`simulation` 变体。依赖 `schema`。 |
| 领域核心 | `@opencode/core` | 全部业务实现：会话与执行、模型/Provider、工具注册与执行、权限、插件宿主、配置、文件系统/VCS/PTY、SQLite 持久化与事件溯源。依赖 `schema`、`ai`、`codemode`、`plugin`、`plugin-browser`、`util`、`http-recorder`、`pty`。**不依赖 protocol / server**。 |
| 服务端 | `@opencode/server` | HttpApi 的运行时实现：`handlers/*` 把 endpoint 接到 core 服务，`routes.ts` 组装 LayerNode 服务图，`fetch.ts` 提供 web-standard fetch handler（Node/workerd 通用）。依赖 `core` + `protocol` + `schema` + `simulation` + `util` + `pty` + `client` + `plugin`。 |
| 客户端 | `@opencode/client` | 由 protocol 生成的类型安全 HTTP 客户端（promise / effect / solid 三种形态）+ 本地 service 发现与拉起。仅依赖 `schema`、`protocol`、`httpapi-codegen`。 |
| 组合根 | `@opencode/sdk` | 把 Client、Core、Server 组合成可嵌入的 SDK（含 workerd 入口）。依赖 `client`、`core`、`server`、`plugin`、`ai`、`schema`、`util`、`protocol`、`httpapi-codegen`。 |
| 终端 UI | `@opencode/tui` | OpenTUI + Solid 的终端界面、命令面板、路由、提示词输入、storybook。依赖 `client`、`ui`、`theme`、`plugin`、`schema`、`simulation`，以及 `latex`/`merman` 作为 markdown 渲染插件。 |
| 进程入口 | `@opencode/cli` | 唯一的可执行入口：命令路由（`Runtime.handlers(Commands, ...)`）、`serve`/`service` 子命令、后台服务拉起、Web UI 静态资源、Bun 编译打包。依赖 `server`、`tui`、`client`、`plugin`、`schema`、`util`、`protocol`、`script`、`pty`。 |
| Web / PWA | `@opencode/app` | Solid 单页应用 + PWA（`vite-plugin-pwa`），同时被 CLI 嵌入、被桌面端作为渲染层。依赖 `client`、`session-ui`、`ui`、`gui-plugins`、`plugin`、`schema`、`util`。 |
| 共享 UI | `@opencode/ui`、`@opencode/session-ui` | 设计系统组件（每组件一个导出路径）与会话渲染层（消息流、diff、markdown、pierre 高亮）。 |
| GUI 插件 | `@opencode/plugin`、`@opencode/gui-plugins`、`@opencode/plugin-browser` | 插件 SDK（promise/effect/tui/gui 四种宿主契约）+ 内置 GUI 插件（file、review、terminal、browser、ssh、wsl…）。 |
| 桌面 | `@opencode/desktop` | Electron 主进程/预加载/渲染器三合一；把 CLI 二进制作为 sidecar 打进去。 |
| 服务/周边 | `@opencode/ai`、`@opencode/codemode`、`@opencode/http-recorder`、`@opencode/httpapi-codegen`、`@opencode/simulation`、`@opencode/theme`、`@opencode/latex`、`@opencode/merman`、`@opencode/patchmark`、`@opencode/nav-menus`、`@opencode/stories`、`@opencode/data-*`、`process-daemon` |

### 2.2 依赖方向（实际 import 关系）

```
schema ──► protocol ──► client ──────────────┐
  │           │                              │
  │           └────────► server ◄── core ◄───┘（client 不依赖 core/server）
  │                          ▲         ▲
  │                          │         │
  └──────────────► cli ──────┘         │
                    ▲                  │
                    │                  │
                  tui ─────────────────┘（仅 import core/util/slug 一个工具函数）
                    │
          app / ui / session-ui / desktop / gui-plugins（只经由 client + schema + plugin）

sdk = client + core + server + plugin + ai   （组合根）
```

仓库 `AGENTS.md` 明确规定的方向：

- Schema → Core 与 Protocol → Server。
- Client 运行时代码可以依赖 Schema 与 Protocol，但**永远不**依赖 Core 或 Server。
- `sdk` 组合 Client、Core、Server。

实测与该规则一致，唯一例外是 `packages/tui` 直接 import 了 `@opencode/core/util/slug`（单点工具，不构成领域依赖），以及 `@opencode/server` 依赖 `@opencode/client`（`ServerProcess` 需要 `@opencode/client/effect/service` 的服务发现能力，属于「服务端使用客户端能力」的反向引用，见第 6 节）。

### 2.3 各层职责细节

#### cli（`packages/cli`）

- 入口 `src/index.ts`：设置 `NO_PROXY`/`no_proxy`、`ensurePluginRuntime()`、`ssh-askpass` 分支，然后用 `Runtime.handlers(Commands, {...})` 声明命令树，每个命令都是**动态 import**（启动敏感路径），最后 `NodeRuntime.runMain` 收尾（SIGTERM → 143、stdout/stderr 优雅 flush）。
- 命令处理器在 `src/commands/handlers/*`：`default`（TUI）、`serve`、`run`、`acp`、`mini`、`auth/*`、`mcp/*`、`plugin/*`、`service/*`、`session/*`、`debug/*`、`models`、`stats`、`pair`、`reload`、`upgrade`、`uninstall`、`api`。
- `src/server-process.ts`：以 `default` / `service` / `stdio` 三种模式跑 HTTP 服务；`service` 模式会 chdir 到 home、读写注册文件、处理 PTY handoff、注册端口占用等。
- `src/services/*`：`server-connection`（选/起后端）、`updater`、`update-preflight`、`web-ui`（静态资源 + CSP）、`port-owner`、`service-registration`、`remote-tunnel`、`retained-image`。
- `bin/opencode.cjs` + `bin/opencode2.cjs`：npm 安装后的 node 启动器，按平台/架构/AVX2/musl 选择真正的二进制包，找不到就报错提示；`opencode2` 只是转发到 `opencode` 的兼容别名。

#### desktop（`packages/desktop`）

- `src/main/index.ts` 刻意保持极小：先 `configureApplication()` + 申请单实例锁 + 注册 renderer scheme，`app.whenReady()` 之后先开窗，再异步 import 其余主进程模块（注释说明：模块图求值会拖慢 ready）。
- `src/preload`、`src/renderer` 分别对应 Electron 预加载与渲染器；渲染层复用 `@opencode/app` 的 `AppBaseProviders`/`AppInterface` 与 `@opencode/app/desktop` 导出。
- 真正干活的是 CLI 二进制：构建时被拷到 `resources/opencode-cli(.exe)`，桌面端把它当 sidecar 进程拉起（`extraResources` + `app.asar` 之外的资源）。

#### server（`packages/server`）

- `src/api.ts` 用 `makeDefaultApi` 传入三个中间件 key（location、form location、session location），把 protocol 的抽象 group 具体化。
- `src/routes.ts` 按 `applicationServiceNodes` 逐条列出 core 的服务节点（App、Global、Database、KV、Bus、PersistentPty、Shell.daemonNode、EventLogger、Job、Project、Worktree、Session、Instance、…），再用 `LayerNode.compile` 组装。
- `src/handlers/*` 一个 endpoint 组一个文件（session、message、model、provider、permission、fs、pty、shell、vcs、worktree、config、mcp、plugin、rpc、event…）。
- `src/fetch.ts` 导出 `make()`：不绑端口、不接信号，返回 `(Request) => Promise<Response>`，用于 workerd/Deno/Bun.serve/测试。
- `src/event-feed.ts` 把 Bus 事件编码成 SSE `data: {...}\n\n` 帧，带 4096 容量上限与溢出错误。

#### core（`packages/core`）

- 导出形式是 `"./*": "./src/*.ts"`，没有单一 index，使用方按模块路径引用（`@opencode/core/session`、`@opencode/core/tool`…）。
- 每个模块顶部是 `export * as X from "./x.js"` 的自我导出模式 + Effect `Context.Service` + `Layer`/`makeGlobalNode`。
- 目录即能力域：`session`、`tool`、`provider`、`model*`、`permission`、`plugin`、`config`、`database`、`event`、`filesystem`、`vcs`、`worktree`、`pty`/`persistent-pty`、`mcp`、`skill`、`command`、`job`、`schedule`、`integration`、`credential`、`oauth`、`usage-limits`、`codemode`、`image`、`ripgrep`、`shell`、`snapshot`、`workspace`、`location*`、`instance`、`bus`。
- `src/database/drizzle/` 内嵌了原 `effect-drizzle-sqlite` 的实现（`EffectDrizzleSqlite` 由此导出）。

#### app（`packages/app`）

- `src/index.ts` 只导出 `AppBaseProviders`、`AppInterface`、`preloadRoute`、`PlatformProvider`、`ServerConnection`；`src/desktop.ts` 追加桌面端需要的 shell/tabs/i18n/persistence 等入口。
- `src/entry.tsx` 是 Web/PWA 入口：Sentry、locale 预加载、PlatformProvider（web 实现）、PWA 路由持久化。
- `vite.config.ts` 使用 `vite-plugin-solid`、`@tailwindcss/vite`、`vite-plugin-pwa`（`vite.pwa.ts` 里自定义 service worker）。

#### ui / session-ui

- `ui` 没有 `"."` 导出，每个组件一个子路径（`./button`、`./dialog`、`./text-input` …），CSS 也按子路径导出；`sideEffects` 只对 `**/*.css` 生效。
- `session-ui` 提供会话渲染：`timeline`、`timeline-next`、`message-part`、`markdown`、`pierre`、`session-diff`、`tool-*`、`sources`、`v2/*`。

#### plugin（`packages/plugin`）

- 同一包内提供四种宿主契约：`./promise`、`./effect`、`./tui`、`./gui`（`gui/main`、`gui/host`、`gui/builtin`、`gui/file`、`gui/review`、`gui/browser`、`gui/updater`、`gui/vite`）。
- `src/runtime.ts` + `src/runtime-modules.ts`：被 CLI 构建时**内联替换**成一张「specifier → 加载器代码」的表，使得编译后的单文件二进制仍能按名字加载插件运行时依赖。
- `src/source.bun.ts` / `source.node.ts` / `source.package.ts` 通过条件导出区分插件来源。

---

## 3. 一条完整数据流：用户输入 → 会话 → 模型 → 工具 → 持久化

以 TUI 里输入一句 prompt 为例（Web/桌面走的是同一 HTTP 面，只是渲染层不同）。

### 3.1 输入与传输

1. **界面层**：TUI 在 `packages/tui/src/prompt/*`、`packages/tui/src/routes/*` 收集输入；Web/桌面在 `packages/app/src/composer/*`。二者都不谈业务，只调 `@opencode/client`。
2. **客户端**：`packages/client/src/promise/index.ts` 导出生成的 `OpenCode` 客户端（由 `packages/client/script/generate.ts` 从 `@opencode/protocol` 的 HttpApi 生成，禁止手改生成文件）。
3. **服务发现**：`packages/client/src/service.ts` 读取本地 service 注册文件（XDG state 目录），必要时 `ensure()` 拉起 `opencode serve --service`；CLI 侧对应 `packages/cli/src/services/server-connection.ts`，会带 `onStart(reason)` 回调（`missing` / `version-mismatch`）。
4. **HTTP**：`POST /api/session/:sessionID/prompt`（group 定义在 `packages/protocol/src/groups/session.ts`）。

### 3.2 服务端接入

5. `packages/server/src/fetch.ts` 的 web handler → `routes.ts` 组装好的 `HttpRouter` → `Authorization` / `SchemaErrorMiddleware` → `LocationMiddleware`（按请求解析 Location，决定了用哪套 Location 级服务）。
6. `packages/server/src/handlers/session.ts` 取 `Session.Service`，调用 `session.prompt({ sessionID, ... })`。

### 3.3 会话准入（durable admission）

7. `packages/core/src/session/session.ts` 的 `prompt`：
   - `SessionPrompt.prepare({ session, messageID, input })` 准备消息、附件、revert 提交；
   - `admission.admit(...)` 写入 durable inbox（`session_inbox` 表），发布 `session.inbox.enqueued`；
   - 若 `resume !== false`，调用 `SessionExecution.wake(sessionID)`。
   - 幂等：同一个 user/synthetic inbox ID 重复准入时，首次准入获胜，重试的 payload/元数据/投递模式被忽略（跨 Session 或跨类型复用则失败）。
8. **投影**：`packages/core/src/session/projector.ts` 消费 durable 事件，在一个事务里插入 `session_inbox` 行；`session.inbox.delivered` 事件则消费 inbox 行并落成可见 message。

### 3.4 执行

9. `SessionExecution` 是**进程级、按 Session ID** 的协调器（`packages/core/src/session/execution*`、`run-coordinator.ts`）：合并同 Session 的唤醒、允许不同 Session 并发；写前执行声明（write-ahead execution claim）作为重启恢复标记。
10. `SessionRunner.drain`（`packages/core/src/session/runner/index.ts`）从**已记录的**历史中跑一次本地续跑；`DrainResult` 可能是 `Complete` / `Moved`（换 Location）/ `Reloaded`。
11. 一步 = 一次显式 `llm.stream` 调用（`packages/core/src/session/runner/step.ts`）。代码注释明确要求：**不要加内存里的 tool loop**，每步都从重新加载的历史继续。
12. 模型解析：`runner/model.ts` + `packages/core/src/model.ts` / `model-resolver.ts` 把 agent 配置的 `Model.Ref` 解析成 route + 凭据 + 能力（chat / 图像 / 语音 / 嵌入…）。

### 3.5 模型 Provider

13. `packages/core/src/provider.ts` 维护 Provider 注册表：内置映射表把 `@opencode/ai/providers/<id>[/<protocol>]` 映射为动态 `import()`；另有 `aisdk-native.ts` 支持 AI SDK 原生 provider。
14. `packages/core/src/effect/app-node-platform.ts` 构造 `LLMClient` / `RequestExecutor`：Bun 下关掉 fetch 的 5 分钟静默超时、可按 Provider 配置注入客户端 TLS 证书、WebSocket 构造器由运行时提供。
15. `@opencode/ai`（`packages/ai/src/route/*`、`llm.ts`、`protocols/*`、`providers/*`）负责真正的请求构造、流式解析、错误分类（`AIError` 的 `Transport` / `InvalidProviderOutput` 等）与工具调用事件的产出。
16. 可选的 `@opencode/http-recorder` 以 Layer 形式包住 `HttpClient`/`Socket`，把录制结果落成 cassette，供 `@opencode/simulation` 与测试回放。

### 3.6 工具调用

17. 流里出现 `tool-call` 事件（且 `providerExecuted !== true`）时，`step.ts` 为每个调用 fork 一个 fiber：
    - `prepared.executeTool` → `packages/core/src/tool.ts` 的 `Snapshot.execute`
    - `ToolOutput.truncate` 截断
    - `publisher.toolExecution(...)` 把结果写回会话事件
18. `Tool` 服务在 `tool/plugin/*` 注册内建工具：`shell`、`read`、`write`、`edit`、`patch`、`glob`、`grep`、`skill`、`subagent`、`todo`、`question`、`webfetch`、`websearch`、`image-generate`、`schedule`、`artifact`、`mcp`（`tool/mcp.ts`）、`opencode` 自身。
19. 每次执行前经过 `Permission` 规则集；`QuestionTool` 可以反向向用户提问；插件钩子（`PluginHooks`）可在 tool 前后介入。
20. Code Mode：`packages/codemode` 把工具暴露成一段可执行程序（工具前缀 + `codemode` 快照），`tool.ts` 里的 `CodeModeTool`/`CodeModeCatalog` 负责编目、权限过滤与 `check`。

### 3.7 持久化

21. **事件溯源**：所有状态变化都走 `Bus`（`packages/core/src/bus.ts`）。durable 事件插入 `EventTable`，`EventSequenceTable` 维护每个 aggregate 的序号（`reserveSequence` 用 `max(seq, ?)` 保证单调）。
22. **投影**：`session/projector.ts` 等投影器把事件折叠进 `session_message`、`session_inbox` 等读模型表；AGENTS.md 要求「只记录不可再推导的新事实」。
23. **数据库**：`packages/core/src/database/database.ts` 通过 `#sqlite` 条件导入选择 `sqlite.bun.ts` / `sqlite.node.ts` / `sqlite.workerd.ts`；打开后设置 WAL、`synchronous=NORMAL`、`busy_timeout=5000`、`cache_size`、`foreign_keys=ON`（workerd 的 Durable Object SQLite 不支持这些 pragma，会跳过）。路径由 `packages/cli/src/database-path.ts` 决定（`OPENCODE_DB` 或 `<data>/opencode.db`）。
24. **回传客户端**：同一次 `bus.publish` 也分发到 `EventFeed` 的订阅者，以 SSE 推给 TUI/Web/桌面；客户端按 `*.updated` 事件刷新（`model.updated`、`plugin.updated`…）。会话历史另有 `Session.log` 的 `after` 游标 + `follow` 的 durable 日志流。

### 3.8 一步之内的失败/边界路径（同文件）

- Provider 错误分类后会走 `SessionRunnerRetry.isRetryable` → `Outcome.Retry`；上下文溢出且尚未产出 → `recoverOverflow` → `Outcome.Compacted`。
- 用户中断：`makeCancel()` 先请求工具协作停止（5 秒 `COOPERATIVE_STOP`），再强制中断；未结算的调用统一标 `aborted`。
- PTY handoff：若服务正在把进程守护交接给下一个进程，`handoffPrepared()` 为真时该 step 直接 `Effect.interrupt`，由下一个服务在 resume 时结算，表现得像崩溃恢复。
- 达到 max steps 后 `toolChoice = "none"`，再来的工具调用返回 `Tool.Error`。

---

## 4. 构建链路

```
packages/core   ──(tsc -p tsconfig.build.json + bun build, 保留 #sqlite/#pty 等外部条件导出)──► dist/
      │
      ▼
packages/cli    ── 1) bun run --cwd packages/app build（Vite + PWA，VITE_OPENCODE_SERVER_MODE=origin）
                ── 2) Brotli 压缩每个产物（beta: q6，其它: q11）→ AppArchive.encode（u32 长度 + JSON 索引 + 压缩体）
                ── 3) Bun.build({ compile: ... }) 12 个目标，注入插件：
                     · virtual:opencode-app-assets → 把归档作为 file 类型 import 进二进制
                     · @opentui/solid 转换插件（TUI 的 Solid JSX）
                     · pty 二进制（resolveOpencodePty → with { type: "file" }）
                     · @parcel/watcher 平台绑定
                     · plugin 运行时模块表（内联替换 runtime-modules.ts）
                     · ws 命名重导出修补（Bun 会丢掉 sideEffects-free 模块的 export *）
                     · models.dev 模型快照
                     · 模拟图校验钩子
                ── 4) 每个目标写 package.json（@opencode/cli-<os>-<arch>[-baseline][-musl]）
                ── 5) NativeArch.verify + verifyArtifact
      │
      ▼
packages/desktop ── copy-icons / copy-metainfo → 取 CLI 二进制（dist/ 有就用，否则 dev 下载 dev、beta 下载 beta，prod 直接报错）
                ── bunx electron-vite build → out/{main,preload,renderer}
                ── verifyBundles(out)
      │
      ▼
script/pack.ts（根 `bun run pack`）── 把所有 workspace package.json 的 version 改成 Script.version → bun install
                ── 按固定顺序在各包内 `bun run pack`：schema, codemode, theme, ai, util, protocol, client,
                   plugin, plugin-browser, core, simulation, server, sdk, ui, cli
                ── packages/cli/script/pack.ts 把 dist/ 打成 npm 包（bin 里的 .exe 是「postinstall 没跑」的占位脚本）
                   并生成 tar.gz/zip 归档（统一 mtime=1980-01-01，保证可复现）
packages/desktop/script/pack.ts ── electron-builder（--config electron-builder.config.ts）
                ── macOS: dmg/zip，额外产出 .app.tar；Windows: nsis 安装包 + win-unpacked；
                   Linux: AppImage/deb/rpm；afterPack 校验 CLI 与 node-pty 的原生架构一致
```

### 4.1 CLI 的 12 个编译目标

`packages/cli/script/build.ts` 的 `allTargets`：

| OS | arch | 变体 |
| --- | --- | --- |
| linux | arm64 / x64 | glibc；x64 额外有 `avx2:false`（baseline） |
| linux | arm64 / x64 | musl；x64 额外有 baseline |
| darwin | arm64 / x64 | x64 额外有 baseline |
| win32 | arm64 / x64 | x64 额外有 baseline |

即 Windows 实际是 **3 个目标**（x64、x64-baseline、arm64），而非「双目标」。命名规则 `opencode-<os|windows>-<arch>[-baseline][-musl]`，产物目录名把 `opencode` 换成 `cli`（`cli-windows-x64-baseline`）。

编译细节：

- `entrypoints: ["./src/index.ts", "./src/photon-worker.ts"]`，`format: "esm"`、`minify`、`bytecode: true`、`splitting: true`。
- `compile.target` = `bun-<os>-<arch>`（如 `bun-windows-x64`），`execArgv` 为 `--smol --user-agent=opencode/<channel>/<version>/cli --use-system-ca --no-warnings --`。
- `define` 注入 `OPENCODE_VERSION` / `OPENCODE_CHANNEL` / `OPENCODE_ARTIFACT` / `OPENCODE_LIBC` / `FFF_LIBC`。
- `BUN_COMPILE_RELEASE` 存在时会从 Bun 官方 release 下载对应 `bun-<platform>-<arch>.zip` 作为 `executablePath`（带 SHA256 校验），用于固定编译用的 Bun 本体。
- musl 目标需要 `bun install --os="*" --cpu="*" --libc="*" @opentui/core @opencode/pty`（Bun 1.4.4 默认跳过其它 libc 的原生包）。
- `--single` 只编译当前平台，`--baseline` 连带 baseline 变体，`OPENCODE_TARGET` 精确选一个。

### 4.2 Web UI / PWA 的嵌入方式

- `packages/cli/script/app-assets.ts`：`bun run build`（在 `packages/app`）→ 排除 `.map` → 逐文件 Brotli（release q11，beta q6）→ `AppArchive.encode`。
- `packages/cli/src/app-archive.ts`：格式为 `u32 LE 索引长度 | JSON 索引 {key: [offset, length]} | 压缩体`，注释解释了为什么不 base64。
- `packages/cli/src/services/web-ui.ts`：`/api/*`、`/auth/*`、`/openapi.json` 走 API；其余走静态资源，HTML 用 nonce 化的 CSP（对 inline theme script 做 sha256），其余资源 `immutable` 长缓存；`index.html`、`sw.js`、`registerSW.js` 用 `no-cache`；支持 `Accept-Encoding: br` 直出压缩字节。

### 4.3 版本与 channel

`packages/script/src/index.ts`（被所有构建脚本 import）：

- 先断言 `process.versions.bun` 满足根 `packageManager` 的 `^` 范围，否则直接抛错。
- `CHANNEL`：`OPENCODE_CHANNEL` > （`OPENCODE_VERSION` 非 `0.0.0-` 前缀则 `latest`）> 当前 git 分支名（非法字符替换为 `-`）。
- `VERSION`：`OPENCODE_VERSION` > 预览版 `0.0.0-<channel>-<buildNumber>`；`latest` 频道没有版本号就直接报错（版本由 release workflow 的 plan job 决定）。
- 同一逻辑在 `.husky/pre-push` 里用内联 bun 脚本复刻，版本不匹配时**警告并跳过** `bun run check`，避免训练大家 `--no-verify`。

---

## 5. 工程约束

### 5.1 Bun 版本

- 根 `package.json`：`"packageManager": "bun@1.4.4"`；`bunfig.toml` 里 `exact = true`、`minimumReleaseAge = 259200`（新版本发布满 3 天才装，附一长串豁免名单）。
- `packages/script/src/index.ts` 硬性校验 `^1.4.4`；`pre-push` 用同一范围。
- Bun 版本直接影响能力：`bun check` 只在较新 Bun 中存在，所以 `typecheck` 脚本的可用性与 pin 绑定。

### 5.2 Lint / 格式化

- `bun run lint` = `oxlint` + `ast-grep scan -c script/ast-grep/gui-plugins/sgconfig.yml` + `bun script/sdk-docs.ts` + `bun script/check-greys.ts`。
- 另有专项：`lint:effect-patterns`、`lint:effect-simplifications`（ast-grep 规则），`test:lint-rules`、`test:effect-simplification-rules`（规则自测）。
- `lint:changed`：只对本次改动过的 GUI 包文件跑 oxlint，并且**连 warn 级（anti-slop）也算失败**。
- `.oxlintrc.json`：内置分类全部 `off`，只启用自研 JS 插件 `anti-slop` / `anti-slop-effect`；`no-restricted-globals` 禁 `Reflect`；对 `gui-plugins`、`plugin/src/gui`、`codemode/interpreter` 有额外的 import 边界规则。
- **格式化用的是 Prettier，不是 oxfmt**：`script/format.ts` = `bun run prettier --ignore-unknown --write .`，根 `package.json` 有 `prettier` 配置（`semi:false`、`printWidth:120`）与 `.prettierignore`。仓库内没有找到任何 oxfmt 配置或依赖（见第 6 节）。

### 5.3 类型检查

- 本地/日常：`bun run typecheck` = `bun turbo typecheck --concurrency=3`；每个包的 `typecheck` 实际执行 `bun check --no-script [flags]`（部分包带 `-b`/`-p tsconfig.tests.json`）。
- CI/发布：`bun run typecheck:tsc` = `bun turbo typecheck:tsc --concurrency=3`，用官方 TypeScript（`@typescript/native`，`typescript@7.1.0-beta`）；两者冲突时 **tsc 为准**。
- `turbo.json` 中 `typecheck`/`typecheck:tsc` 都 `dependsOn: ["transit"]`（把全部 workspace 依赖折进 hash）；`typecheck:tsc` 额外要求 `@opencode/core#typecheck:tsc` 先产出声明。
- 全量校验：`bun run check` = `lint` + `typecheck`，也是 pre-push 钩子跑的东西。
- 禁止直接调用 `tsc`；`bun check` 不产出声明文件，所以 TS5088/TS2883 这类声明发射错误只会在 `tsc` 下出现，属预期。

### 5.4 测试

- **根目录不能跑测试**：`bunfig.toml` 里 `[test] root = "./do-not-run-tests-from-root"`，根 `package.json` 的 `test` 脚本也是 `echo 'do not run tests from root' && exit 1`。必须在包目录里跑（如 `cd packages/core && bun test`）。
- 各包脚本：
  - `core`：`bun run script/test.ts` —— 先建临时 HOME/XDG 目录、过滤掉所有 `*_API_KEY`/`TOKEN`/`SECRET`/云厂商环境变量，再跑 bun test（隔离用户真实凭据）。
  - `ai` / `cli` / `http-recorder` / `latex` / `merman` / `protocol` / `server` / `tui` / `theme` / `simulation`：`bun test --timeout 30000 --only-failures` 一类。
  - `app`：`test` = `test:unit`（`bun test --conditions=solid`，预加载 `../ui/test/solid-jsx.ts` + `happydom.ts`）+ `test:browser`（`--conditions=browser`）；另有 `test:e2e`/`test:components`/`test:service-worker`/`test:stability`（Playwright）。
  - `session-ui` / `ui`：`bun test src --only-failures`；组件测试用 Playwright components config。
  - `desktop`：`bun test --timeout 30000`，且 `turbo.json` 里显式 `cache:false`。
  - `stories`：只 `vite --port 6006`，供 Playwright 组件测试使用。
- 全仓：`turbo run test`（`test` 任务 `dependsOn: ["transit"]`，注释说明「每个有 test 脚本的包都会在这里跑，新增测试不会被漏掉」）。
- 测试规范（AGENTS.md）：尽量不用 mock、不用 `globalThis.*`；测试真实实现；写测试前先读 `.opencode/skills/{unit-tests,tui-tests,app-e2e-tests,component-tests}`。

### 5.5 其它约定（影响架构的）

- 不生成/不使用 Changesets，默认分支 `dev`。
- 契约改了之后必须 `bun run generate`（在 `packages/client`），`check:generated` 会 `git diff --exit-code` 校验生成物。
- 实验性 API 一律 `/api/experimental/<group>/...`，OpenAPI identifier 为 `experimental.<group>.<method>`，SDK 里是 `client.experimental.<group>.<method>`，并有测试双向校验。
- 功能开关在 `packages/schema/src/config/flag.ts`，读取用 `Flag.enabled("<key>")`。

---

## 6. 反直觉之处（阅读中发现的）

1. **`packages/tui` 直接依赖 `@opencode/core`**：`package.json` 列了 `@opencode/core`，但全仓只 import 了 `@opencode/core/util/slug` 一个函数。这违反了「UI 层不碰领域层」的直觉，属于可以清理的历史残留。
2. **`@opencode/server` 依赖 `@opencode/client`**：服务发现（注册文件、incumbent 探测）被放在 client 包里，于是服务端反过来 import 客户端。分层规则只禁止「client → core/server」，没有禁止这个方向。
3. **`@opencode/cli` 不依赖 `@opencode/core`**：CLI 只声明 `server`、`tui` 等，core 是通过 server 传递进来的。所以「CLI 是 core 的宿主」这个直觉在依赖声明上不成立。
4. **40 多个包里有近 10 个是空壳**：`console`、`stats`、`enterprise`、`function`、`gui-extensions`、`posts`、`storybook`、`web` 只有 `node_modules/`（`git ls-files` 为 0），`identity` 只有 6 个品牌图片，`effect-drizzle-sqlite` 只剩 1 个示例迁移（实现已并入 `packages/core/src/database/drizzle/`）。看目录树会严重高估包数量。
5. **一步之内没有工具循环**：`step.ts` 明确「每步一次 `llm.stream`，从重载的历史继续」，多轮工具往返靠 runner 的外层 drain，而不是 while 循环。这在读代码时最容易被误判成缺失逻辑。
6. **`session_inbox` 只存未消费的工作**：`inbox.enqueued` 投影插入行，`inbox.delivered` 投影把行删掉并在同一事务写入可见 message。所以「inbox 表」不是消息表，历史在 `session_message`。
7. **web UI 是二进制归档，不是字符串**：`app-archive.ts` 特意用原始字节（而非 base64/JS 字符串），注释说明 Bun 的 bytecode 会把它存两遍。
8. **`bin/` 里的 `.exe` 是 Bash 脚本**：`packages/cli/script/pack.ts` 生成的 `bin/opencode.exe` 内容是 `echo "postinstall 没跑" >&2` 之类，靠 `postinstall.mjs` 覆盖成真二进制。Windows 上这是有意为之的占位。
9. **`process-daemon` 不是 TypeScript 包**：它是 Rust crate（`opencode-pty`，用 `portable-pty` + `libghostty-vt`），同时在 `npm/` 里发 `@opencode/pty` 的 npm 包。CLI 构建时把对应平台的二进制以 `with { type: "file" }` 嵌进可执行文件。
10. **`@opencode/codemode` 没有任何内部依赖**：它自己是一套独立解释器/VM/快照，core 单向依赖它，而不是反过来。
11. **构建脚本会改写全仓 `package.json` 版本**：根 `script/pack.ts` 先正则把所有 `"version"` 替换成 `Script.version` 再 `bun install`，然后才逐包 pack。本地跑 `bun run pack` 会真实改动工作区。
12. **`bun run dev` 与 `dev:live` 的区别是隐式的**：`dev` 只是跑 CLI，可能与已安装版本不一致的托管服务互相替换；`dev:live` 通过 `opencode service status/get password` 显式连到活的服务并注入凭据。AGENTS.md 要求优先用 `dev:live`，否则「隐式托管连接可能替换掉活服务」。
13. **`Session.log` 的 `after` 游标按 aggregate 序号，不按事件数量**：注释说明 `Synced` 标记的 seq 可能大于最后一条事件，因为其它 durable bus 共享同一序号空间。
