import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { api } from "./api"

/**
 * Blue Topaz widgets: sticky "last user request" badge + per-session stats / sequence bars.
 * 原生移植自注入版 bluetopaz.js；元素拾取器（<> 按钮）已移除。
 */

const STICKY_ID = "bt-sticky"

/** 粘性徽章距宿主面板右缘的内缩量（px）；想让它离右边远一点就调大这个数 */
const STICKY_RIGHT_INSET = 24

/** 每轮末尾「折叠思考」按钮的类名与文案 */
const THINK_COLLAPSE_CLASS = "bt-think-collapse"
const THINK_COLLAPSE_TEXT = "折叠思考"

/** 会话状态栏右缘与输入框左缘的水平间距（px） */
const STATS_RIGHT_GAP = 10

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement("textarea")
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand("copy") } catch {}
    ta.remove()
  }
}

// ---- 每个会话独立的 widget 状态 ----
// 内存 Map 保证切换会话时立即呈现该会话自己的历史与统计；
// localStorage 让状态跨重启留存（"每个对话独立保存"）。

type Tokens = { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } }
type SessionInfo = { tokens?: Tokens }
type SeqEntry = { id: string; text: string; absIdx: number }
type SessionState = { seq: SeqEntry[]; stats: string; um: string[] }
type StoredState = { seq?: string[]; stats?: string; um?: string[] }

const SESSION_STATE_KEY = "bt.session-state.v1"
const sessionStates = new Map<string, SessionState>()

function readStoredStates(): Record<string, StoredState> {
  try {
    return JSON.parse(localStorage.getItem(SESSION_STATE_KEY) || "{}") as Record<string, StoredState>
  } catch {
    return {}
  }
}

function stateFor(sid: string): SessionState {
  const existing = sessionStates.get(sid)
  if (existing) return existing
  const state: SessionState = { seq: [], stats: "", um: [] }
  const stored = readStoredStates()[sid]
  if (stored) {
    if (Array.isArray(stored.seq))
      state.seq = stored.seq.map((text, index) => ({ id: "seq" + index, text: String(text), absIdx: index }))
    if (typeof stored.stats === "string") state.stats = stored.stats
    if (Array.isArray(stored.um)) state.um = stored.um.map((text) => String(text))
  }
  sessionStates.set(sid, state)
  return state
}

let persistTimer: number | null = null
function persistStates() {
  const out: Record<string, { seq: string[]; stats: string; um: string[] }> = {}
  for (const [sid, state] of sessionStates) {
    if (!state.seq.length && !state.stats && !state.um.length) continue
    out[sid] = { seq: state.seq.map((entry) => entry.text), stats: state.stats, um: state.um.slice(0, 20) }
  }
  try { localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(out)) } catch {}
}
function schedulePersist() {
  if (persistTimer !== null) return
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    persistStates()
  }, 800)
}
function flushPersist() {
  if (persistTimer === null) return
  clearTimeout(persistTimer)
  persistTimer = null
  persistStates()
}

export function BlueTopazWidgets() {
  // ---- 粘性"最近用户请求"徽章 ----
  const [, setStickyVisible] = createSignal(false)
  const [stickyText, setStickyText] = createSignal("")
  const [stickyPos, setStickyPos] = createSignal({ right: STICKY_RIGHT_INSET, top: 8 })
  let stickyTarget: Element | null = null

  // ---- 会话状态栏（按会话独立统计） ----
  const [statsText, setStatsText] = createSignal("")
  const [statsVisible, setStatsVisible] = createSignal(false)
  const [statsPos, setStatsPos] = createSignal({ right: 0, bottom: 0 })
  let activeSid: string | null = null

  function fmtTok(n: number): string {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
    return String(n)
  }

  /** 走渲染器 RPC 拿 sidecar origin（凭据不下发），请求路径带 /api 前缀。
   *  注意：绝不能自带 Authorization —— 主进程只在本帧请求缺该头时才注入 sidecar 凭据
   *  （main/windows/security.ts 的 wireRendererHeaders），自带反而会被跳过。 */
  async function sessionRequest(sid: string, suffix: string): Promise<Response | null> {
    const ready = await api.awaitInitialization().catch(() => null)
    if (!ready?.url) return null
    const base = String(ready.url).replace(/\/$/, "")
    return fetch(`${base}/api/session/${encodeURIComponent(sid)}${suffix}`)
  }

  /** 只统计指定会话自身的 tokens，不再汇总全部会话 */
  async function loadSessionStats(sid: string) {
    const r = await sessionRequest(sid, "")
    if (!r || !r.ok) return
    const payload = (await r.json()) as SessionInfo & { data?: SessionInfo }
    const info: SessionInfo = payload.data ?? payload
    if (activeSid !== sid) return
    const t = info.tokens
    const ti = t?.input || 0
    const to = t?.output || 0
    const tr = t?.reasoning || 0
    const cr = t?.cache?.read || 0
    const cw = t?.cache?.write || 0
    const denom = cr + cw + ti
    const hit = denom > 0 ? Math.round((cr / denom) * 100) : 0
    const text = `输入 ${fmtTok(ti)} · 输出 ${fmtTok(to)}${tr ? ` · 思考 ${fmtTok(tr)}` : ""} · 缓存命中 ${hit}%`
    stateFor(sid).stats = text
    schedulePersist()
    setStatsText(text)
    setStatsVisible(true)
    // 定位统一由 updateSticky 管理（侧栏左下竖排），此处只更新文本
  }

  function findScroller(): HTMLElement | null {
    const turn = document.querySelector('[data-component="session-turn"]')
    for (const c of document.querySelectorAll(".scroll-view__viewport")) {
      if (!turn || c.contains(turn)) return c as HTMLElement
    }
    return null
  }

  /** 输入框（composer）：v2 的标记是 [data-component="composer"]（v1 的 prompt-input-v2 已不存在）；
   *  可能同时挂着多个（dock 等），取可见的那个 */
  function findComposer(): HTMLElement | null {
    for (const element of document.querySelectorAll<HTMLElement>('[data-component="composer"]')) {
      if (element.getBoundingClientRect().height > 0) return element
    }
    return null
  }

  // 用户消息文本登记簿：路过视口即记录，虚拟化卸载后徽章仍可显示（按会话独立）
  function rememberUm(el: Element) {
    if (!activeSid) return
    const history = stateFor(activeSid).um
    const body = el.querySelector('[data-slot="user-message-body"],[data-component="user-message-body"]')
    const t = ((body ?? el).textContent || "").replace(/\s+/g, " ").trim()
    if (t && history[0] !== t) history.unshift(t.slice(0, 60))
    if (history.length > 30) history.length = 30
    schedulePersist()
  }

  // ---- 折叠思考：每轮末尾一个小按钮，只折叠这一轮里的思维链 ----
  // 时间线是虚拟化的、行会被回收，所以按钮做成池子复用（不塞进 Solid 管理的容器），
  // 位置按视口坐标钉住，随 updateSticky 一起刷新。

  const thinkButtons: HTMLButtonElement[] = []

  /** 一轮里是否还有东西在跑：流式正文 / 等待中 / 工具或思维链仍在 shimmer / 当前工作轮 */
  function roundRunning(round: HTMLElement[]) {
    return round.some(
      (row) =>
        row.querySelector('[data-streaming], [data-pending="true"], [data-component="text-shimmer"][data-active="true"], [data-slot="session-turn-assistant-content"][aria-hidden="true"]') !==
        null,
    )
  }

  /** 按 DOM 顺序把时间线行切成「轮」：每个 user 消息开新一轮 */
  function timelineRounds(sc: HTMLElement): HTMLElement[][] {
    const rounds: HTMLElement[][] = []
    let current: HTMLElement[] | null = null
    for (const row of sc.querySelectorAll<HTMLElement>("[data-timeline-row]")) {
      if (row.dataset.timelineRow === "bottom-spacer") continue
      if (row.dataset.timelineRow === "UserMessage") {
        if (current) rounds.push(current)
        current = [row]
        continue
      }
      if (current) current.push(row)
    }
    if (current) rounds.push(current)
    return rounds
  }

  /** 折叠该轮里所有展开着的思维链胶囊（点的是 app 自己的触发器，状态会同步回 app） */
  function collapseRoundThinking(round: HTMLElement[]) {
    for (const row of round) {
      const triggers = row.querySelectorAll<HTMLElement>(
        '[data-component="reasoning-part"] [data-slot="collapsible-trigger"][aria-expanded="true"]',
      )
      for (const trigger of triggers) trigger.click()
    }
  }

  function thinkButton(root: HTMLElement, index: number) {
    const existing = thinkButtons[index]
    if (existing) return existing
    const button = document.createElement("button")
    button.type = "button"
    button.className = THINK_COLLAPSE_CLASS
    button.textContent = THINK_COLLAPSE_TEXT
    root.appendChild(button)
    thinkButtons[index] = button
    return button
  }

  /** 每个"跑完了、且还有展开的思维链"的轮末尾放一个按钮 */
  function updateThinkCollapse(sc: HTMLElement) {
    const root = document.getElementById("bt-widgets-root")
    if (!root) return
    const host = hostBox()
    const wanted: Array<{ round: HTMLElement[]; left: number; top: number }> = []
    for (const round of timelineRounds(sc)) {
      if (roundRunning(round)) continue
      const hasExpanded = round.some(
        (row) =>
          row.querySelector('[data-component="reasoning-part"] [data-slot="collapsible-trigger"][aria-expanded="true"]') !==
          null,
      )
      if (!hasExpanded) continue
      const rect = round[round.length - 1].getBoundingClientRect()
      if (rect.height <= 0) continue
      wanted.push({ round, left: Math.round(rect.left + 8 - host.left), top: Math.round(rect.bottom + 2 - host.top) })
    }
    for (let index = 0; index < wanted.length; index++) {
      const item = wanted[index]
      const button = thinkButton(root, index)
      button.style.display = ""
      button.style.left = `${item.left}px`
      button.style.top = `${item.top}px`
      button.onclick = () => {
        collapseRoundThinking(item.round)
        updateSticky()
      }
    }
    for (let index = wanted.length; index < thinkButtons.length; index++) thinkButtons[index].style.display = "none"
  }

  function updateSticky() {
    ensureRootHost()
    // 非对话页面（Git 面板等）隐藏全部 widgets
    // 判定强化：scroller 必须真实包含会话回合（Git 面板等视图也有滚动区，会误判）
    const sc0 = findScroller()
    const hasSession = !!(sc0 && (sc0.querySelector("[data-component='session-turn']") || currentSessionId()))
    const btRootEl = document.getElementById("bt-widgets-root")
    if (btRootEl) btRootEl.style.display = hasSession ? "" : "none"
    if (!hasSession) {
      setStickyVisible(false)
      switchSession(null)
      return
    }
    switchSession(currentSessionId())
    updateSeqBar()
    // 状态栏定位：贴到输入框左侧，下沿与输入框下沿齐平
    const composer = findComposer()
    if (composer) {
      const cr = composer.getBoundingClientRect()
      if (cr.height > 0) {
        // 竖排文本宽度不定，所以锚右缘：右缘始终在输入框左缘左侧 STATS_RIGHT_GAP px
        const host = hostBox()
        const want = {
          right: Math.round(window.innerWidth - cr.left + STATS_RIGHT_GAP - host.offX),
          bottom: Math.round(window.innerHeight - cr.bottom - host.offY),
        }
        setStatsPos(prev => (prev.right === want.right && prev.bottom === want.bottom) ? prev : want)
      }
    }
    const sc = findScroller()
    // 滚动器/面板可能被重建，观察目标失效就重挂（替代原先 1.5s/5s 的定时重挂）
    syncLayoutObserver(sc)
    if (!sc) { setStickyVisible(false); return }
    updateThinkCollapse(sc)
    const sr = sc.getBoundingClientRect()
    const ums = Array.from(sc.querySelectorAll("[data-component='user-message']")).filter(
      u => u.getBoundingClientRect().height > 8,
    )
    let lastAbove: Element | null = null
    let anyVisible = false
    for (const u of ums) {
      rememberUm(u)
      const r = u.getBoundingClientRect()
      if (r.bottom > sr.top && r.top < sr.bottom) { anyVisible = true; break }
      // 取向上最近的一条：持续覆盖，循环结束时的 lastAbove 即最靠近视口顶的用户消息
      if (r.bottom <= sr.top) lastAbove = u
    }
    if (anyVisible || !lastAbove) {
      // 视口内还有用户消息 → 徽章隐藏；但已登记的文本保留供卸载后兜底
      setStickyVisible(false); return
    }
    stickyTarget = lastAbove
    const bodyEl = lastAbove.querySelector('[data-slot="user-message-body"],[data-component="user-message-body"]')
    const text = ((bodyEl ?? lastAbove).textContent || "").replace(/\s+/g, " ").trim()
    const remembered = activeSid ? stateFor(activeSid).um : []
    if (!text && remembered[0]) {
      // 兜底：目标回合已被虚拟化卸载——显示登记簿里最近的用户消息，
      // 点击退回最顶上的已挂载回合（近似定位）
      setStickyText("↩ " + (remembered[0].slice(0, 58)))
      setStickyVisible(true)
      return
    }
    setStickyText(text.slice(0, 60))
    // 徽章贴着滚动区内渐变 sticky 头的下沿（找不到头则回退到视口顶 +8）
    const stHeader = sc.querySelector(":scope > div.sticky.top-0") as HTMLElement | null
    // 视口坐标 → 面板坐标（root 挂在面板里，绝对定位子元素用的是面板坐标）
    const badgeTop = Math.round(
      (stHeader ? stHeader.getBoundingClientRect().bottom + 4 : sr.top + 8) - hostBox().top,
    )
    // 右缘锚定宿主面板右缘向左 STICKY_RIGHT_INSET px（自校准；序列条走 anchorTarget()，锚点独立）
    // right 不用换算：calibratedRight 用实测视口右缘闭式求解，与包含块是谁无关
    const panel = getHostPanel()
    const target = panel ? panel.getBoundingClientRect().right - STICKY_RIGHT_INSET : null
    const badgeRight = target === null ? stickyPos().right : calibratedRight(stickyPos().right, document.getElementById(STICKY_ID), target)
    setStickyPos(prev => (prev.right === badgeRight && prev.top === badgeTop) ? prev : { right: badgeRight, top: badgeTop })
    setStickyVisible(true)
  }

  // 序列条数据：当前会话的用户输入历史（最近20条），按会话独立缓存
  const [seqEntries, setSeqEntries] = createSignal<SeqEntry[]>([])
  const [seqTop, setSeqTop] = createSignal(0)
  const [seqRight, setSeqRight] = createSignal(12)

  /** 桌面端跑的是 MemoryRouter，location.pathname 永远停在文档地址（oc://renderer/index.html），
   *  真实路由由 app 自己写在 localStorage 的
   *  `opencode.desktop.window.<windowID>.last-active-url`（见 renderer/window/router.tsx）。
   *  早先读 location.pathname 的判断在 v2 里恒为 null → activeSid 一直为空 → 序列条/状态栏全被清空。 */
  function currentRoutePath(): string | null {
    const id = (window as unknown as { electron?: { windowID?: string } }).electron?.windowID
    if (!id) return null
    try {
      return localStorage.getItem(`opencode.desktop.window.${id}.last-active-url`)
    } catch {
      return null
    }
  }

  function currentSessionId(): string | null {
    const match = currentRoutePath()?.match(/\/session\/([^/]+)/)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  }

  /** 会话切换：立即呈现目标会话自己的缓存数据，再异步刷新。 */
  function switchSession(sid: string | null) {
    if (sid === activeSid) return
    activeSid = sid
    stickyTarget = null
    if (!sid) {
      setSeqEntries([])
      setStatsText("")
      setStatsVisible(false)
      setStickyVisible(false)
      return
    }
    const state = stateFor(sid)
    setSeqEntries(state.seq)
    setStatsText(state.stats)
    setStatsVisible(!!state.stats)
    setStickyVisible(false)
    void refreshSession(sid)
  }

  async function refreshSession(sid: string) {
    await Promise.all([
      loadUmHistoryFromApi(sid).then(() => undefined).catch(() => undefined),
      loadSessionStats(sid).catch(() => undefined),
    ])
    if (activeSid === sid) updateSeqBar()
  }

  /** 把 widgets root 挂进会话面板（session-chat-panel）。
   *  面板带 @container 且宽度随侧栏/审查栏开合做 240ms 过渡：挂在里面才能保证
   *  widgets 始终待在聊天区域内、并跟着面板一起伸缩（挂 documentElement 时会留在原地）。
   *  面板被 Solid 重渲染清掉时，MutationObserver 会再触发这里补挂。 */
  function ensureRootHost() {
    const root = document.getElementById("bt-widgets-root")
    if (!root) return
    const panel = document.querySelector<HTMLElement>('[data-slot="session-chat-panel"]')
    const parent: HTMLElement = panel ?? document.documentElement
    if (root.parentElement !== parent) parent.appendChild(root)
    panel?.classList.add("bt-host-panel")
  }

  /** 宿主面板 = widgets root 的包含块。
   *  root 是面板内 inset:0 的绝对定位元素，所以「root 的父节点」就是定位基准；
   *  还没搬进面板（非会话页，root 挂 documentElement）时返回 null。 */
  function getHostPanel(): HTMLElement | null {
    const parent = document.getElementById("bt-widgets-root")?.parentElement
    return parent && parent !== document.documentElement ? parent : null
  }

  /** 视口坐标 → 面板坐标的换算基准。
   *  直接用 root 自己的矩形：root 是 inset:0 的绝对定位元素，它的 padding box 正是
   *  面板内所有子元素的包含块（含 @container 的 layout containment 效应），
   *  而 getBoundingClientRect() 给的是视口坐标，写内联 left/top/right/bottom 前必须减掉它。
   *  还没搬进面板时 root 就在视口原点，四项天然为 0，即恒等变换。 */
  function hostBox() {
    const r = document.getElementById("bt-widgets-root")?.getBoundingClientRect()
    if (!r || r.width === 0) return { left: 0, top: 0, offX: 0, offY: 0 }
    return {
      left: r.left,
      top: r.top,
      offX: window.innerWidth - r.right,
      offY: window.innerHeight - r.bottom,
    }
  }

  /** 右缘锚点目标：宿主面板右缘向左 10px（视口 x 坐标） */
  function anchorTarget(): number | null {
    const panel = getHostPanel()
    if (!panel) return null
    return panel.getBoundingClientRect().right - 10
  }

  /** 自校准右偏移（闭式解）：R' = R + (实测右缘 − 目标)。
   *  由 实测右缘 = 包含块右缘 − R 反解，不依赖包含块是否为视口，一拍收敛 */
  function calibratedRight(currentRight: number, el: HTMLElement | null, target: number): number {
    const r = el?.getBoundingClientRect()
    if (!r || r.width === 0) return currentRight
    return Math.max(0, Math.round(currentRight + (r.right - target)))
  }

  function extractUmText(el: Element): string {
    const b = el.querySelector('[data-slot="user-message-body"],[data-component="user-message-body"]')
    return ((b ?? el).textContent || "").replace(/\s+/g, " ").trim()
  }

  function setSeqEntriesFromTexts(texts: string[], sid: string) {
    const clean = texts.map((text) => text.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean)
    const entries = clean.slice(-20).map((text, index) => ({ id: "seq" + index, text, absIdx: index }))
    stateFor(sid).seq = entries
    schedulePersist()
    if (activeSid === sid) setSeqEntries(entries)
  }

  function loadUmHistoryFromDom() {
    const sid = activeSid
    const sc = findScroller()
    if (!sid || !sc) return
    const texts = Array.from(sc.querySelectorAll("[data-component='user-message']"))
      .map(extractUmText)
      .filter(Boolean)
    if (texts.length) setSeqEntriesFromTexts(texts, sid)
  }

  /** 从 sidecar API 加载指定会话的用户消息文本 */
  async function loadUmHistoryFromApi(sid: string): Promise<string[]> {
    const r = await sessionRequest(sid, "/message")
    if (!r || !r.ok) {
      loadUmHistoryFromDom()
      return []
    }
    const payload = (await r.json()) as
      | Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }>
      | { data?: Array<{ info?: { role?: string }; parts?: Array<{ type?: string; text?: string }> }> }
    const msgs = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : []
    if (activeSid !== sid) return []
    const texts: string[] = []
    for (const m of msgs) {
      if (m.info?.role !== "user") continue
      const part = m.parts?.find((p) => p.type === "text" && p.text)
      const clean = (part?.text ?? "").replace(/\s+/g, " ").trim()
      if (clean) texts.push(clean.slice(0, 200))
    }
    if (texts.length) setSeqEntriesFromTexts(texts, sid)
    else loadUmHistoryFromDom()
    return texts
  }

  /** 序列条刷新：仅重算位置；数据由 API 周期加载，非会话视图保留现有条目 */
  function updateSeqBar() {
    const sc = findScroller()
    if (!sc || seqEntries().length === 0) return
    const sr = sc.getBoundingClientRect()
    const bar = document.getElementById("bt-seqbar")
    if (!bar) return
    // 量序列条自身高度来垂直居中：块高/间距都在 CSS 里，别在 JS 里再写死一遍每格高度
    const barHeight = bar.getBoundingClientRect().height
    if (barHeight <= 0) return
    setSeqTop(Math.round(sr.top + sr.height / 2 - barHeight / 2 - hostBox().top))
    // 右缘与粘性徽章同锚：宿主面板右缘向左 5px（自校准）
    const target = anchorTarget()
    if (target !== null) setSeqRight(calibratedRight(seqRight(), bar, target))
  }

  /** 跳转到登记序号为 seqIdx 的用户输入（0=最旧，length-1=最新）
   *  虚拟化环境下目标可能未挂载——逐屏向上搜索直到进入挂载窗口 */
  async function scrollToSeqEntry(seqIdx: number) {
    const sc = findScroller()
    if (!sc) return
    const total = seqEntries().length
    if (!total) return

    for (var attempt = 0; attempt < 8; attempt++) {
      var ums = Array.from(sc.querySelectorAll("[data-component='user-message']")).filter(
        function(u){ return u.getBoundingClientRect().height > 8 }
      )
      if (!ums.length) { await sleep(250); continue }

      // 挂载窗口假设：尾部连续（最新的 m 条已挂载）
      // 第 j 个挂载 um 对应全局序号 total - m + j
      var m = ums.length
      var firstGlobal = total - m
      var lastGlobal = total - 1

      if (seqIdx >= firstGlobal && seqIdx <= lastGlobal) {
        // 目标已挂载：精确居中
        ums[seqIdx - firstGlobal].scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }

      // 未挂载：向目标方向翻页
      if (seqIdx < firstGlobal) {
        // 目标更靠旧（上方）→ 向上翻一屏
        sc.scrollTop -= sc.clientHeight * 0.75
      } else {
        // 目标更新（下方）→ 向下翻一屏
        sc.scrollTop += sc.clientHeight * 0.75
      }
      await sleep(320) // 等虚拟化挂载
    }
    // 多次逼近仍未精确命中：停在最后一次位置（已在目标邻域）
  }

  function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }

  function scrollBack() {
    if (stickyTarget && findScroller()?.contains(stickyTarget)) {
      // 瞬时滚动：smooth 动画期间虚拟化重锚会打断跳转
      stickyTarget.scrollIntoView({ block: "center" })
    } else {
      const sc = findScroller()
      const turns = sc?.querySelectorAll("[data-component='session-turn']")
      if (turns && turns.length) turns[0].scrollIntoView({ block: "start" })
    }
  }

  const onResize = () => updateSticky()

  // 布局观察：滚动器与宿主面板都可能被路由重建（来回切页面），
  // 目标失效就重挂，所以这里保存当前观察对象、由 updateSticky 每次同步。
  let layoutObserver: ResizeObserver | null = null
  let observedScroller: HTMLElement | null = null
  let observedHost: HTMLElement | null = null

  function syncLayoutObserver(sc: HTMLElement | null) {
    if (typeof ResizeObserver === "undefined") return
    if (!layoutObserver) layoutObserver = new ResizeObserver(() => updateSticky())
    if (observedScroller !== sc) {
      if (observedScroller) {
        observedScroller.removeEventListener("scroll", updateSticky)
        layoutObserver.unobserve(observedScroller)
      }
      observedScroller = sc
      if (sc) {
        sc.addEventListener("scroll", updateSticky, { passive: true })
        layoutObserver.observe(sc)
      }
    }
    const host = getHostPanel()
    if (observedHost === host) return
    if (observedHost) layoutObserver.unobserve(observedHost)
    observedHost = host
    if (host && host !== sc) layoutObserver.observe(host)
  }

  onMount(() => {
    const mo = new MutationObserver(() => updateSticky())
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("resize", onResize)
    window.addEventListener("beforeunload", flushPersist)
    updateSticky()
    // 历史/统计加载重试：启动早期可能失败（server 未就绪等），退避重试
    const retry = (n: number) => {
      const sid = activeSid
      if (!sid) {
        if (n > 0) setTimeout(() => retry(n - 1), 1500)
        return
      }
      Promise.all([
        loadUmHistoryFromApi(sid).then(() => { if (activeSid === sid) updateSeqBar() }),
        loadSessionStats(sid),
      ]).catch(() => {
        if (n > 0) setTimeout(() => retry(n - 1), 2000)
      })
    }
    retry(6)
    // 低频刷新：会话切换即时生效，会话内数据随对话增长而更新
    const statsIv = setInterval(() => {
      const sid = currentSessionId()
      if (sid !== activeSid) switchSession(sid)
      if (!activeSid) return
      void loadUmHistoryFromApi(activeSid).then(() => { if (activeSid) updateSeqBar() }).catch(() => undefined)
      void loadSessionStats(activeSid).catch(() => undefined)
    }, 10000)
    onCleanup(() => {
      mo.disconnect()
      observedScroller?.removeEventListener("scroll", updateSticky)
      layoutObserver?.disconnect()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("beforeunload", flushPersist)
      clearInterval(statsIv)
      thinkButtons.forEach((button) => button.remove())
    })
  })

  return (
    <>
      <div
        id="bt-statsbar"
        style={{
          right: `${statsPos().right}px`,
          bottom: `${statsPos().bottom}px`,
          visibility: statsVisible() ? "visible" : "hidden",
        }}
      >
        {statsText()}
      </div>
      <button
        type="button"
        id={STICKY_ID}
        classList={{ "bt-sticky-empty": !stickyText() }}
        style={{ right: `${stickyPos().right}px`, top: `${stickyPos().top}px` }}
        onClick={scrollBack}
      >{"↩ " + stickyText()}</button>
      <Show when={seqEntries().length > 0}>
        <div id="bt-seqbar" style={{ top: `${seqTop()}px`, right: `${seqRight()}px` }}>
          {seqEntries().map((e, clickedIdx) => (
            <button
              type="button"
              class="bt-seq-bar"
              onClick={() => { void scrollToSeqEntry(clickedIdx) }}
            >
              <span class="bt-seq-tip">
                <span class="bt-seq-tip-text">{e.text}</span>
                <svg
                  class="bt-seq-tip-copy"
                  viewBox="0 0 16 16"
                  width="13"
                  height="13"
                  aria-label="复制"
                  onClick={(ev) => { ev.stopPropagation(); void copyText(e.text) }}
                >
                  <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3" />
                  <path d="M3.5 10.5V3.5a1 1 0 0 1 1-1h6.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      </Show>
    </>
  )
}
