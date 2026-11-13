# M0 后续：测量可靠性与视觉参考边界

开始时间：2026-11-13 20:36（Asia/Shanghai）。本文件接续 [首轮 M0 报告](frontend-m0-2026-11-13.md)，不覆盖首轮报告、closeout 或失败实验。

## 1. 本轮范围

- 继续处理 A/A 的 CDP 会话失联、终态画面漂移与统计资格，而不是开始 M1/M4。
- 仍使用 `frontend-baseline` / `92c1d38e86bf5720c44cb0572f32a8e1c035b8fb`；没有重新切分支、fetch/merge 或修改业务源码。
- 如需调整准备/观测逻辑，只在忽略区的独立基准夹具中操作，保持生产代码、输入工作量与两侧配置相同。
- 两个子代理分别只读核对 fixture/setup 的状态一致性与 native strobe 的 CDP/生命周期/预算证据；主代理负责运行隔离实验、证据归档与结果资格判断。

## 2. 原始证据保持不变

- 首轮拒绝实验：`dist/m0/2026-11-13/strobe/experiments/exp_b060e7/result.json`。
- 首轮快照与交接：`dist/m0/2026-11-13/snapshot.json`、`verification.json`、`closeout.json`。
- 首轮报告 SHA-256：`33b2b93e8e23263a7f7770991dfb06784897d43f3bb15045d7754a87108809c6`。
- 后续记录独立放在 `dist/m0/2026-11-13/followup/`；strobe 使用原 state 目录以复用缓存，但每次实验生成新 ID，不覆盖已存在的结果。

## 3. 执行前约束

- 20:39 的实际空闲：C 约 11.747 GiB，F 约 9.465 GiB，RAM 约 14.48 GiB；不把早先 C 盘 0.7 GiB 的状态当成当前状态。
- 复用本机已有、已复制到 F 盘的 Bun 1.4.4，不更新全局工具、不安装依赖。
- 单次运行至少保留 C 2 GiB / F 3 GiB；TMP/TEMP、transpiler cache 和 strobe state 指向 F 盘。
- `--power keep --reserve-cpus off`；不更改电源计划、不移动其他进程、不关闭/重启用户 App 或服务。
- 正式 A/A 请求至少 6 对；延长的是整个多 launch 实验的预算，不放宽单个状态等待或抹掉错误。
- 计时期间不并行源码哈希、单测、其他构建或子代理探索。
- 成功条件不是 exit 0 或“没有显著差异”：必须检查 native primary verdict、完整 pair 数、终态一致性和有效性警告。

## 4. 诊断与夹具

### 本轮诊断结论

- fixture 中的 119/108 是不同历史轮次的 Markdown 标题，不是文案变化。异常 base 块在 setup 后由 119 变为 108，其他块仍为 119。
- 异常块记录 `frames.n=0`、100% dropped、无 display.hz；输入样本没有在一秒内找到呈现帧。其低延迟值可能退化成按键往返时间，不能作输入到呈现的性能证据。正常对照块有呈现帧。
- 原 setup 仅等待外层 viewport、composer 与 `page.idle()`。冷挂载内部仍可能 hidden，Markdown 与尺寸/pin 也可能稍后完成；`idle` 的 300ms 静默不等于这些业务状态已完成。这是可验证的准备缺口，不代表已确认全部漂移成因。
- 本 fixture 的消息接口一次返回全部历史且没有 next cursor，因此**本次输入场景不是导航分页预取导致的差异**，不能为此改生产分页逻辑。
- 失联时间与 6m 总预算截止高度接近，而完整多 launch / warmup 需要更长时间；但失败块无 recording、runner 日志为空，不能直接证明是 strobe 清理 target 还是浏览器先释放会话。未发现同期 crash/hang 日志仅是排除线索，不是“不会崩溃”的证明。
- native 计划建议至少 8 对；首轮 3 对既不足 95% 判定，也不足设计预算。正式 follow-up 使用 8 对、30m 总预算，不放宽单个状态等待，不使用会改动其他进程亲和性的 `--reserve-cpus on`。

证据：首轮实验各块/recording、`packages/app/perf/fixtures/timeline.ts:85-143,317-329`、`timeline.bench.ts:48-64`、`virtualizer.tsx:1204-1212`、`cold-mount.ts:1-4,129-132` 与 strobe 的 Page/Expect 类型定义。

### 夹具改动（仅忽略区）

`dist/m0/2026-11-13/followup/stable-timeline.bench.ts`：

1. 复用原 bench 的 targets 与 measured typing 函数。已用固定 Bun 1.4.4 导入验证 **targets 引用相同、measured function 引用相同、primary 仍为 interaction.p95**；没有改变 120 轮数据、viewport、settings 或 80ms 输入节奏。
2. 仅在 setup/reset 等待最后历史回答与最新 prompt 可见、冷挂载已 reveal、mounted Markdown 全 ready、旧顶端行未挂载，并对两次静默后的行 key/高度/位置作一致性检查。等待以状态驱动、有 60s 截止，不用固定 sleep；未达状态即拒绝。
3. case 的 `expect` 增加 heading `Session renderer review 119` 与两个 visible 标记；漂移应成为 WrongScreen 拒绝，不再仅有 ScreenChanged 告警。
4. 不改 fallback 行高、cold reveal 兜底、生产 CSS/worker、mock 数据、resetCheck 或 measured run。不会把两个不等价画面强行说成一致。

本地运行包装器：`dist/m0/2026-11-13/followup/run-case.ps1`。它实测并记录 HEAD/tree/branch、基准与包装器哈希、参数、退出码、磁盘余量与源码清洁状态；拒绝覆盖同名尝试，且要求首轮报告哈希未变。

参数：`--pairs 8 --max-time 30m --unlock-wait 30s --power keep --reserve-cpus off --trace lean --why never`。本轮 `plan.json` 是估算：8 对、2 个丢弃预热块，约 7min blocks + 4min build；新夹具尚无 spread，不能把估算当实际完成时间。

## 5. 执行结果

### 本轮夹具检查：`exp_624b76`

- 21:02:31–21:07:03，exit 1，`kind=check`、`passed=false`。
- 准备日志两次记录同一稳定状态：reveal 已完成、119 尾部与最新 prompt 可见、pendingMarkdown=0、oldestMounted=false、行 key 相同、scrollHeight=25588、scrollTop=24874、viewportHeight=714。
- 拒绝发生于输入动作后的帧等待：`WindowHidden`，`document.visibilityState="hidden"`，原生分类 `hidden="other"`；`values=null`、`recording=null`。不是把空结果当成性能值。
- 30m 总预算尚未到，因此这次新失败不能归因于原先的 6m 截断。原生动作账本是一条 high-level `type`、outcome=ok，没有在实测 run 前执行 Ctrl+A reset；没有证据支持“本轮 reset 留下 Ctrl 导致新 tab”的假设。
- 原生 progress 在 block 前已报告 head window hidden、尝试唤醒显示器并重跑 block；这解释了两条 setup 日志，不是两个并行上下文。
- 当前会话仍能返回 visibilityState，所以这次是可见性丢失，不是又复现了 session id 丢失。具体是显示器空闲关闭、窗口遮挡、后台 tab 或 Chrome 判定，现有工件无法区分。
- 已知显示器空闲关闭策略为交流 15min / 电池 10min；API/合成输入不一定等同真实本机输入。准备状态已稳定，但**本轮 smoke 仍失败，尚未启动 8 对 A/A**。

证据：`followup/check-stable-timeline.json`、`.native-summary.json`、`.canonical.log` 与 `strobe/experiments/exp_624b76/result.json`。后续不能删除帧/可见性约束或切 headless 来冒充同一种输入到呈现基线。

### 下一步需要的环境条件

选项是让隔离 Chrome 保持前台，或经用户允许，在测试包装器线程中临时使用 `SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED)`：只在测试期间请求屏幕/系统不因 idle 自动休眠，退出释放，不改电源计划，也不阻止用户手动睡眠。保活不能解决窗口遮挡，原生可见性与帧校验仍保留。

21:33 用户明确选择“临时保活复测”。包装器新增显式 `-KeepAwake`，不默认开启；申请/恢复在同一包装器线程的 try/finally 中完成，保存前后电源计划与请求释放结果。先以新 attempt `awake-stable-timeline` 重做短检查，成功且确有呈现帧才开始 A/A，不覆盖第一次 WindowHidden 记录。

### 临时保活后的短检查：`exp_b6b5dd`

- 21:40:15–21:40:34，exit 0、check PASS，第 119 轮终态正确。
- 结果提取检查 `hardIssues=[]`，确认实际呈现帧存在；没有 NotSteady/OverheadBudget 警告，但仍有 Background 33% 与 StaleCalibration 提示。这仍只是单次正确性检查，不是性能证书或优化幅度。
- 本线程申请成功，原 flags `0x80000000`；退出恢复成功，release 返回 `0x80000003`，`released=true`。前后电源计划 GUID 都为 `00bfce50-794f-499b-885d-f7dc6ab20617`，未由包装器改变。
- 基准 SHA-256 仍为 `c245873a0c09df593bc098d87e687f580a23c1c4988aaad33ae4673caed080cf`；只增加测试期间保活，未改 measured function 或生产代码。
- 原始与提取结果：`followup/check-awake-stable-timeline.json`、`.summary.json`、`.power-request.json` 与 `strobe/experiments/exp_b6b5dd/result.json`。

### 8 对 A/A 已完成：`exp_f1584e`

- 21:50:49–22:09:28，原生 exit 0，完整 8 对 / 16 个实测 block。
- 16 个 block 的始终画面都是第 119 轮，DOM 节点数均为 1,257，均有呈现帧；本轮未再出现 WindowHidden、RunIncomplete、CDP 会话丢失或 ScreenChanged。只能说本轮运行与场景问题没有再发生，不能据此证明所有原始故障的唯一根因。
- 临时保活成功释放，原线程 flags 已恢复，前后电源计划 GUID 相同；没有移动其他进程、关闭 App 或改变永久电源设置。
- **主指标原生判定 `underpowered`，不是 `same`。** `interaction.p95`：n=8，p≈0.461，区间置信度≈96.1%，相对差异区间约 -24.7% 至 +90.3%。区间虽可计算，但太宽，不能认定 2% 边界内等价，更不能比较架构性能。
- 工具对当前目标给出 needed_pairs≈2,219（达到约 80% 判定机会的估计），这不是要求继续执行。**本轮不会跑 2,219 对、放松边界或更换主指标来刷绿。**
- `HighVariance`：base/head 的输入 P95 跨 launch CV 为 32%/22%；16 个 block 都记录了测量 CPU 上的背景负载，另有 NotSteady、采样预算、StaleCalibration 与 Rerun 提示。只能记录观测到的 Node/Defender 等负载，不能仅凭进程名断言具体是谁造成。
- `Rerun` ledger 保留了首轮拒绝与本轮夹具/对数/等待参数变化。改动基于已确认的准备/可见性缺口，原主指标、2% 边界、生产源码和 measured function 未改，但仍不能将改过夹具的本次结果与旧烟测数值拼成“优化提升”。
- 提取结果：`hardIssues=[NoNativeSameVerdict]`，`warningConcerns=[OverheadBudget,NotSteady]`；`nativeMethodChecksPass=false`、`cleanMethodCertificate=false`。运行完成不等于方法证书通过。
- 原始与提取结果：`followup/aa-awake-stable-timeline.json`、`.summary.json`、`.power-request.json`、`.canonical.log` 与 `strobe/experiments/exp_f1584e/result.json`。

### 本轮验收范围

| 层级 | 结果 |
| --- | --- |
| 独立夹具准备状态 | 已验证末尾真正渲染与位置稳定；生产代码未改 |
| 临时保活短检查 | PASS；确有呈现帧，原电源计划未变 |
| A/A 运行完整性 / 终态一致性 | 8 对完整、16 个 block 有帧且终态一致 |
| 统计等价方法证书 | **未通过：underpowered，高方差与背景负载** |
| 相对旧代码 / 上游的性能提升 | 未测，不声明 |
| M1 / M4 业务或视觉改造 | 未执行 |

建议不再无限追逐当前噪声环境下的 2% 键盘延迟判定。若必须证明速度收益，应另选低噪声时段并预先确定工程上有意义的指标/阈值；后续功能重构可以优先验收请求次数、状态一致性与布局连续性，但不能把它们说成已经通过的计时性能证书。

Microsoft 文档确认：`GetSystemPowerStatus` 返回交流/电池/节电信息，**不能用于断言显示器已开启**；不按这条错误建议实现显示器检查。

### 磁盘变化审计

仅只读检查本轮目录：所查 strobe/tmp/transpiler-cache 桶约 61 MiB，当前 `packages/app/dist` 为 156,775,021 B / 5,525 文件。F 盘有 6,318 MiB 的系统 pagefile，但没有对应初始值。现有证据不足以把约 3.5 GiB 空闲变化归因于本轮 build/cache；未扫描整个 F 盘、未删除缓存或系统文件。原始审计见 `followup/storage-audit.json`。

## 6. OpenClaw 视觉参考

用户明确表示喜欢 **OpenClaw 当前的一些前端风格**。具体喜欢的是布局、配色、消息卡片、导航还是动效尚未确定。

这是一条后续视觉参考偏好，不是已经确定的设计规格：

- 不据此更换 OpenCode 框架、复制 OpenClaw 的全部 UI 或改写当前主题。
- 不声称已检查用户当前 OpenClaw 界面，也不凭品牌印象编造其现有组件样式。
- 到视觉阶段再核对实际界面与用户喜欢的元素，区分可借鉴的视觉语言与不适合开发工作台的交互。
- 本轮不进行业务或视觉重构。

## 7. 收尾校验与交接

- 22:21 的 `dist/m0/2026-11-13/verification-followup-final.json`：11,636 个 tracked 文件全部逐一 SHA-256 匹配，0 改变/0 缺失；原有两份未跟踪文件及副本、原始源码 ZIP 都匹配。
- 分支/HEAD 仍为 `frontend-baseline` / `92c1d38e86bf5720c44cb0572f32a8e1c035b8fb`；旧报告 SHA-256 仍为 `33b2b93e8e23263a7f7770991dfb06784897d43f3bb15045d7754a87108809c6`，旧实验与 closeout 未覆盖。
- 两次保活请求均已在 finally 里释放，相关包装器进程已结束；不留下永久保活、电源配置或用户 App 改动。
- 新夹具/包装器/结果提取脚本另存 `followup/harness-snapshot.zip`，校验清单 `harness-manifest.final.json`。归档仅有自建工具源文件，没有浏览器 profile、数据库、用户数据或凭据。
- 本轮非忽略新增材料只有这份 follow-up 报告；未 add、commit 或 push，未开始 M1/M4。
- 最终状态：**运行与场景一致性问题本轮已解决，统计等价证书仍未达标**。完整 8 对数据和 underpowered 结果已保留，不把“未发现假阳性”说成“已证明 same”。

后续应优先选择能可靠观察的功能与操作数量契约（重复请求、状态一致性、布局连续性）。如果要发布速度提升数字，再另行准备低噪声、事先确定指标的性能比较；不继续追跑本次 2,219 对估算，也不通过事后调整指标/边界把结果改成通过。

## Sources

- 首轮 M0 报告、冻结快照和原始实验 `exp_b060e7`。
- 本轮只读 Git 状态、时钟和机器资源记录。
- 本轮两个子代理对 fixture 与 native CDP/预算证据的交叉分析；固定 Bun 导入一致性检查、PowerShell 解析检查、`followup/plan.json`。
- 按仓库测试约定实读的 Playwright 官方 Best Practices、Auto-waiting 与 Assertions 文档；这些原则不代替 strobe 自身 API 定义。
- Microsoft Win32 `SetThreadExecutionState` 与 `GetSystemPowerStatus` 官方参考；尚未执行保活请求，须先与用户对齐测量环境。
- 用户关于继续工作及 OpenClaw 视觉偏好的原话。
