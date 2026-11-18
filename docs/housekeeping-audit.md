# packages/ 与根目录卫生审计

> **执行状态（2026-11-14 晚已落地，本文件保留为审计原档）**
>
> 下列内容当时只是只读结论，现在**大部分已执行**。看这份文档时请对照现状：
>
> - 已完成：`.gitignore` 加 `.bun-cache/`；删 8 个空壳目录；删 `identity`（6 个 blob）与 `effect-drizzle-sqlite`；删 `packages/cli/.bun-cache/`（109.94 MB）；清 turbo 幽灵 `.npmrc`、release 脚本两个死 exclude、`"random"` 占位脚本、`screenshot-uk.png`、`.git.worktree_bak`；`.dockerignore` 补 `.bun-cache`；`timeline-suspense` 复现接进 CI。
> - 已推翻的结论：`sst-env.d.ts` **不能删**（它携带 `/// <reference types="vite/client" />`，是 app 唯一的 vite 类型来源，删了 app typecheck 炸 200+ 错误，已还原）；`bunfig.toml` 的 `[test] root` **是故意护栏**，不是缺陷。
> - 仍待处理：`packages/app/e2e/reproduction/timeline-suspense` 的归属（已接 CI，未结案前保留）。
> - 实际回收：约 110 MB 缓存 + **9.7 GB**（8 个空壳目录里含真实 `node_modules` 树，远超当时按"残留"估算的 0.75 MB）。
>
> 下面是当时的只读审计原档，未逐一改写。

> 审计基线：`dev` @ `3baca154bb`（Merge remote-tracking branch 'fork/dev' into dev），2026-11-14。
> 体积口径：**含目录内残留的 `node_modules`**（要回收的就是磁盘空间），但**"是否被 git 跟踪"**用 `git ls-files` 单独判断，两者在下面分列。
> 未执行 `bun run pack`（会改写全仓版本号并跑 install）。

---

## 0. 一句话结论

8 个"空壳目录"是**上游已明确删除的包的本地残留**（有删除提交可查），`identity` / `effect-drizzle-sqlite` 是**一次批量导入提交 `80d43eb707` 顺手带进来的孤儿文件**，`packages/cli/.bun-cache/` 是**本机 `bun build --compile` 的编译产物缓存**。合计可回收 **≈110.7 MB**，其中 109.9 MB 来自 `.bun-cache`，8 个空壳目录加起来只有 0.75 MB。

**风险最低、可无条件执行的一条**：给根 `.gitignore` 加 `.bun-cache/`（不删任何东西就能止住 110 MB 的误提交风险）。

---

## 1. 核实结论表

| 目录 | `git ls-files` | `package.json` | 仓库内引用 | 历史证据（最后一个删除提交） | 判定 |
| --- | --- | --- | --- | --- | --- |
| `packages/console` | 0 | 无 | 仅 `script/release.ts:15` 的 **exclude** 路径（排除用，非引用） | `3efbdad965` chore(console): remove the old opencode.ai site (#62388) | 已删除包，残留 |
| `packages/stats` | 0 | 无 | 无 | `070b980c0b` refactor(data): strict dev/production stages and data naming | 已删除包，残留 |
| `packages/enterprise` | 0 | 无 | 无 | `9e68770074` chore: retire session sharing backend (#55716) | 已删除包，残留 |
| `packages/function` | 0 | 无 | 无（`services/site/src/docs/v1/**` 里的 `packages/functions` 只是文档示例，路径都不对） | `9c318ce47a` chore: move the api worker into the legacy service | 已删除包，残留 |
| `packages/gui-extensions` | 0 | 无 | 仅注释掉的 URL：`services/site/src/component/site/extension-data.ts:87,109` | `dae4077a96` feat: add OpenCode Desktop GUI plugins（同提交把 `gui-extensions/*` 全部 D 掉，改名 `gui-plugins`） | 已删除包，残留 |
| `packages/posts` | 0 | 无 | 无 | `14f7cb9db9f` chore: remove posts site (#62180) | 已删除包，残留 |
| `packages/storybook` | 0 | 无 | 仅一句文档字符串：`packages/session-ui/src/storybook/current-session-fixtures.ts:465` | `28c2a86f8f` chore(app): replace Storybook with a story server for component tests (#57966) | 已删除包，残留 |
| `packages/web` | 0 | 无 | 无（`packages/data/app/src/asset/fonts/OpenTUIMono-OFL.txt` 等提到的是 **opentui 仓库**里的 `packages/web`） | `c1aa4e2753a` chore(web): move the V1 docs into services/site and remove packages/web (#63117) | 已删除包，残留 |
| `packages/identity` | **6**（图片） | 无 | 无。`git grep` 搜 `packages/identity`、`identity/mark`、`mark-512` 全部零命中 | `80d43eb707` chore: update nix node_modules hashes（该提交一次加入 8567 个文件，属批量导入） | 孤儿文件 |
| `packages/effect-drizzle-sqlite` | **1**（示例 SQL） | 无 | 无 | 同上，`80d43eb707` 加入；`36f559b0c6` 删掉了它的 `sst-env.d.ts` | 孤儿文件 |

补充核实（都是"干净"的证据）：

- **bun.lock 干净**：`packages/{console,stats,enterprise,function,gui-extensions,posts,storybook,web,identity,effect-drizzle-sqlite}` 在 `bun.lock` 里**零命中**，所以删掉不会让 `bun install --frozen-lockfile` 报 workspace 缺失。
- **workspace 配置干净**：`package.json` 的 `workspaces.packages` 是 glob（`packages/*`、`packages/plugins/*`、`services/*`、`packages/data/*`），没有逐个列举；无 `package.json` 的目录本来就不会被当成 workspace。
- **turbo.json 干净**：`tasks` 里没有这些包名（只有 cli/sdk/server/simulation/tui/desktop/app/stories/core）。
- **tsconfig 干净**：`packages/**/tsconfig*.json` 里没有任何指向这些目录的 `references`/`paths`。
- **CI 干净**：`.github/**`、`Dockerfile`、`.dockerignore`、`*.nix`、`*.toml` 里对这些路径零命中。`check-test.yml:86` 只点名 `@opencode/app` 和 `@opencode/stories`。
- **死 workspace 依赖**：脚本比对了 38 个 workspace 包的全部 `dependencies/devDependencies/peerDependencies`，`workspace:*` 引用 **0 条死链**。
- **`packages/identity` 的图片是可复原的重复件**：`mark.svg` 的 blob 是 `157edc4d7522f38d3d34aff1317d304cb7958752`，与 `packages/ui/src/assets/favicon/favicon.svg`、`favicon-v3.svg` **逐字节相同**。其余 4 个 PNG 只有 122–330 字节（占位级），`mark-light.svg` 330 字节。

---

## 2. 清理清单

### 2.1 空壳目录（无跟踪文件）

体积 = 目录全量（含残留 `node_modules`，其中大部分是指向根 `node_modules` 的 junction／symlink，真实占用很小）。

| 目录 | 体积 | git 跟踪 | 残留内容 | 建议动作 |
| --- | --- | --- | --- | --- |
| `packages/console` | 126.5 KB | 否 | `app/.turbo/turbo-typecheck:tsc.log` + `node_modules` 残壳 | 删目录 |
| `packages/stats` | 190.3 KB | 否 | 2 个 turbo 日志 + 残壳 | 删目录 |
| `packages/enterprise` | 77.8 KB | 否 | 仅 `node_modules` 残壳（22 个条目） | 删目录 |
| `packages/function` | 39.2 KB | 否 | 仅残壳（8 个条目） | 删目录 |
| `packages/gui-extensions` | 109.1 KB | 否 | 仅残壳（26 个条目） | 删目录 |
| `packages/posts` | 79.6 KB | 否 | 1 个 turbo 日志 + 残壳 | 删目录 |
| `packages/storybook` | 77.8 KB | 否 | 仅残壳（17 个条目） | 删目录 |
| `packages/web` | 63.4 KB | 否 | 仅残壳（20 个条目） | 删目录 |
| **小计** | **763.7 KB** | — | — | — |

> 注意：这些 `node_modules` 里有很多 junction。**用 `Remove-Item -Recurse` 会删掉链接本身而不是目标**（Windows 上 junction 的删除行为），但为绝对安全，建议先 `cmd /c rmdir` 关掉 junction 语义风险，或直接 `git clean -xfd packages/console ...`（需用户自己执行，本审计不代跑）。

### 2.2 孤儿文件目录

| 目录 | 体积 | git 跟踪 | 内容 | 建议动作 |
| --- | --- | --- | --- | --- |
| `packages/identity` | 1.8 KB | **是**（6 个 blob） | `mark.svg` / `mark-light.svg` / `mark-{96,192,512}x512*.png`，无 `package.json`、零引用 | **保留并说明**：体积可忽略，且是品牌素材（虽与 `packages/ui` 的 favicon 重复）。若要收口，建议 `git mv` 到 `services/site/public/brand/` 而不是直接删 |
| `packages/effect-drizzle-sqlite` | 0.1 KB | **是**（1 个 blob） | 仅 `examples/migrations/20240101000000_create_users/migration.sql`，包本身已并入 `packages/core/src/database/drizzle/` | **删目录**（低风险；这是一次批量导入的残渣，且在 git 历史里可随时找回） |

### 2.3 体积大头：`packages/cli/.bun-cache/`

| 项 | 数值 |
| --- | --- |
| 路径 | `packages/cli/.bun-cache/bun-windows-x64-baseline-v1.4.4` |
| 体积 | **109.94 MB**（单文件） |
| git 跟踪 | **否**（`git status` 里是 `?? packages/cli/.bun-cache/`） |
| 是否被忽略 | **否**（`git check-ignore -v packages/cli/.bun-cache` → 退出码 1，无规则命中） |
| 文件头 | `MZ`（PE 可执行文件），即 Bun 的 baseline 运行时本体 |
| 时间戳 | 创建 2026-11-14 01:09:16 / 修改 01:09:17（本机今天构建产生） |

**性质判定**：这是 `bun build --compile` 交叉编译时 Bun 自己下载并缓存的**目标平台运行时**。证据链：

1. 文件名 `bun-windows-x64-baseline-v1.4.4` 与 `packages/cli/script/build.ts` 的编译目标命名严格对应（`build.ts:196` `target: target.replace(binary, "bun")`，`build.ts:340` 对 `item.avx2 === false` 追加 `baseline`），根 `package.json` 的 `packageManager` 也是 `bun@1.4.4`。
2. 仓库里**没有任何配置**指向它：根 `.gitignore`、根 `bunfig.toml`（只有 `[install]` / `[test] root`）、`packages/cli/bunfig.toml`（只有 `preload`）都没有 `cache dir` 相关设置；`git grep ".bun-cache"` 只命中 `.github/actions/setup-bun/action.yml` 里 GitHub Actions 自己的缓存 step（无关）。
3. 它是本机构建副产物，不是共享/可移植资产。

**为什么没进 .gitignore**：根 `.gitignore` 有 `.cache`（对应 `build.ts:75` 的 `path.join(dir, ".cache", "bun-app-archive.bin")`）、有 `dist`、`ts-dist`、`*.bun-build`，但**唯独没有 `.bun-cache`**——即 Bun 这个缓存目录是后来才出现的（Bun 1.4.x 的编译缓存目录），.gitignore 没跟上。

**删掉会不会影响构建**：不会中断，只是下一次对 `bun-windows-x64-baseline` 目标做 `bun build --compile` 时需要**重新下载**这 ~110 MB（有网即可）。对 `bun install`、`typecheck`、`test`、CI 完全无影响（CI 每次全新环境，本来就没有这份缓存）。

**建议动作**：`加 .gitignore`（必须）+ `删目录`（可选，省 110 MB）。两步都做，或者只做第一步都算修完。

### 2.4 合计

| 分类 | 可回收 |
| --- | --- |
| `packages/cli/.bun-cache/` | 109.94 MB |
| 8 个空壳目录（含残留 node_modules） | 0.75 MB |
| `packages/effect-drizzle-sqlite` | 0.1 KB |
| `packages/identity`（若选择收口） | 1.8 KB |
| **总计** | **≈ 110.7 MB** |

顺带一提：真正有分量的不是这些目录，而是**被 gitignore 漏掉的那一个文件**。目录清理更多是"让 `ls packages/` 不再骗人"。

---

## 3. 风险说明

### 可以直接断定安全的

| 动作 | 为什么安全 |
| --- | --- |
| 删 8 个空壳目录 | `git ls-files` 全为 0 → 删除**不产生任何 git 变更**（连 `git status` 都不会变）。每个目录都有上游删除提交可查，不是本地未提交的工作成果。里面只有 turbo 日志和 node_modules 残壳，全部被 .gitignore 覆盖 |
| 根 `.gitignore` 加 `.bun-cache/` | 纯忽略规则，不改任何现有跟踪状态 |
| 删 `packages/cli/.bun-cache/` | 编译缓存，可再生；无任何 tracked 文件引用 |
| 删 `packages/effect-drizzle-sqlite/` | 1 个 SQL blob、零引用、零 workspace 关系；历史可回溯 |

### 需要用户拍板的

| 事项 | 顾虑 |
| --- | --- |
| 删 `packages/identity/` | 有 6 个**被跟踪**的 blob → 删除会进 git 历史（一个 commit 删 6 个文件）。图片是品牌素材，虽然与 `packages/ui` favicon 重复，但"是否还要留一份顶层品牌图"是产品/设计决策，不是纯卫生问题。建议先 `git mv` 到 `services/site/public/brand/` 或原样保留 |
| 删 `.bun-cache` 的时机 | 若这台机器今晚还要跑 Windows baseline 交叉编译（发布前常见），删了会多一次 110 MB 下载。无风险，只是慢 |
| 把 `docs/`、`i18n-zh-audit.txt` 入库还是忽略 | 这是**未跟踪的工作产物**（见下节），入库与否影响仓库噪音，属策略选择 |
| `packages/app/e2e/reproduction/timeline-suspense/` | 该目录的 `playwright.config.ts` **没有任何引用**：`packages/app/package.json` 的 e2e 脚本只调 `playwright.config.ts` / `e2e/service-worker/` / `e2e/stability/`，CI 只跑 `e2e/service-worker/playwright.config.ts`（`check-test.yml:303`），`packages/app/test-browser/playwright-config.test.ts:41` 也只枚举主配置与 stability。看起来是调试某个 timeline suspense 问题时的临时脚手架。**若确认已结案可删**，但属"故意的复现目录"还是"遗忘的残渣"，只有作者知道 |

### 对 CI / 发布的影响

- **CI**：删除这些路径对 `.github/workflows/*` 零影响。没有任何 job 按路径枚举 `packages/<name>`，`check-test.yml` 走 turbo `--affected`，`bun.lock` 里也没有这些 workspace，因此 `--frozen-lockfile` 不会失败。
- **发布**：`script/release.ts:15` 的 `changelogExclusions` 里有 `":(exclude)packages/console"`。删掉目录后该 pathspec 依然合法（git 对不存在的 pathspec 不报错，只匹配不到东西），**不会让 release 脚本挂**。但它是死配置，见第 4 节第 3 条。
- **`bun run pack`**：`packages/cli/script/pack.ts` 只扫带 `package.json` 的 workspace 目录，空壳目录不入选。**本次审计未执行 pack**。

---

## 4. 其他仓库卫生问题（≤10 条，每条可定位）

| # | 问题 | 位置 | 严重度 |
| --- | --- | --- | --- |
| 1 | **`.bun-cache` 未被忽略**：110 MB 未跟踪文件天天出现在 `git status`，`git add -A` 一次就进仓库 | `.gitignore`（缺 `.bun-cache/`）；实际文件 `packages/cli/.bun-cache/bun-windows-x64-baseline-v1.4.4` | **高** |
| 2 | **turbo 全局依赖指向不存在的文件**：`.npmrc` 在仓库里根本不存在，导致 turbo 的 global hash 白算一个不存在的输入（缓存失效判断失真） | `turbo.json` → `globalDependencies` 里的 `".npmrc"` | 中 |
| 3 | **release 脚本里的死路径**：`packages/console`（已被删除的包）和 `infra`（仓库里不存在） | `script/release.ts:14-18` `changelogExclusions` | 中 |
| 4 | **`sst-env.d.ts` 看着像残渣，其实是**载重件——**不要删**：文件头写着 auto-generated by SST，内容只有空 `ImportMetaEnv`，但它带着 `/// <reference types="vite/client" />`，是 `@opencode/app` 唯一的 vite 环境类型来源 | `packages/app/src/sst-env.d.ts` | 保留 |
| 5 | **`bunfig.toml` 的 test root 指向不存在的目录**（**不是问题，别修**）：这是故意的护栏——配合根 `package.json` 的 `"test": "echo 'do not run tests from root' && exit 1"`，让误从根跑 `bun test` 时找不到测试而不是跑到全仓 | 根 `bunfig.toml` → `[test] root = "./do-not-run-tests-from-root"`（该目录不存在且未被跟踪） | 忽略 |
| 6 | **无人引用的根目录截图**：`git grep` 全仓零命中 | `screenshot-uk.png`（根目录，被跟踪） | 低 |
| 7 | **陈旧 worktree 指针**：60 字节的 gitdir 备份文件，指向 `F:/AI/agent/opencode-src/.git/worktrees/opencode-v2`（另一份检出），未跟踪也未忽略 | 根目录 `.git.worktree_bak` | 低 |
| 8 | **垃圾 npm script**：占位脚本留在正式 `package.json` 里 | 根 `package.json:32` `"random": "echo 'Random script'"` | 低 |
| 9 | **`.dockerignore` 未忽略 `.bun-cache`**：`packages/cli` 下有 `Dockerfile`（`pack:docker` 用它），若在该目录做 build context，110 MB 缓存会被送进 builder | `.dockerignore`（有 `.turbo`、`node_modules`、`**/dist`，无 `.bun-cache`） | 低（当前 Dockerfile 只 `COPY dist/...`，不整目录 copy） |
| 10 | **未跟踪的工作产物堆积在根目录**：`docs/`（含本文件与 `architecture-overview.md`、`packages.md`）、`i18n-zh-audit.txt`（56 KB）都是 untracked 且未被忽略，会持续污染 `git status` | `docs/`、`i18n-zh-audit.txt` | 低 |

**最值得先修的一条 = #1**。它同时是"110 MB 空间"和"误提交风险"两个问题的根因，改动只有一行，零副作用。相比之下删 8 个空壳目录只回收 0.75 MB。

### 明确标记为"不要动"的本地改动（不是卫生问题，是用户 WIP）

- `M packages/core/src/schedule/check.ts`
- `?? packages/core/test/*.test.ts`（8 个新增测试）、`?? packages/plugin-browser/test/tunnel-large.real.test.ts`

这些看起来是进行中的开发，任何 `git clean -xd` 类的"清理"都会毁掉它们。**执行清理命令时必须限定具体路径，绝不要用 `git clean -xfd packages/` 或全仓 `-fd`。**

---

## 5. 建议执行顺序

1. **先止血（零风险，不改任何跟踪状态）**
   根 `.gitignore` 追加 `.bun-cache/`；顺手把 `docs/`、`i18n-zh-audit.txt`、`.git.worktree_bak` 一并决定（忽略 or 后续入库）。此时 `git status` 应立刻变干净——这是最好的验证点。

2. **删空壳目录（零 git 影响）**
   逐个删 8 个：`console stats enterprise function gui-extensions posts storybook web`。
   验证：`git status --porcelain` 输出与删除前**完全一致**（因为这些都是被忽略/未跟踪内容）。

3. **删编译缓存（可选，省 110 MB）**
   `packages/cli/.bun-cache/`。若近期还要出 Windows baseline 产物，可放到发布之后再删。

4. **删 `packages/effect-drizzle-sqlite/`（需要一个 commit）**
   这是被跟踪的，删除会进历史。建议和本审计报告、以及其他卫生修复合成一个 `chore: housekeeping` commit。

5. **`packages/identity/` 交用户拍板**
   保留 or `git mv` 到 `services/site/public/brand/`（保留一份，去掉"看起来像包但不是包"的误导）。**不建议直接删**。

6. **修死配置（低风险，各自独立可回滚）**
   - `turbo.json` 删 `".npmrc"`（或补一个真的 `.npmrc`）——已做
   - `script/release.ts` 删 `":(exclude)packages/console"` 和 `":(exclude)infra"`——已做
   - **`packages/app/src/sst-env.d.ts` 不要删**（见上表第 4 条，实测会炸 app typecheck）
   - `bunfig.toml` 的 `[test] root` 要么建目录要么删掉该行
   - 根 `package.json` 删 `"random"` 脚本、删 `screenshot-uk.png`

7. **验证**
   `git status`、`bun install --frozen-lockfile`（只验证 lock 一致，不要跑 `bun run pack`）、`bun turbo typecheck --filter=@opencode/core`。CI 侧等下一次 PR 的 `check-test` 结果即可。

---

## 附：本次核实用的命令（可复现）

```powershell
git ls-files packages/<dir>                       # 跟踪文件数
git log --diff-filter=D --oneline -1 -- packages/<dir>   # 最后一个删除提交
git grep -n --fixed-strings "@opencode/<name>"     # 包名引用
git grep -n --fixed-strings "packages/<dir>"       # 路径引用
Select-String -Path bun.lock -Pattern '"packages/<dir>'   # lockfile workspace
git check-ignore -v packages/cli/.bun-cache        # 是否被忽略（退出码 1 = 未忽略）
Get-ChildItem <dir> -Recurse -File -Force | Measure-Object Length -Sum
git hash-object <file>；git ls-tree -r HEAD --format='%(objectname) %(path)'  # 找重复 blob
```
