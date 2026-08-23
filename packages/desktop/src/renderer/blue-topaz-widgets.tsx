import { createSignal, onCleanup, onMount, Show } from "solid-js"

/**
 * Blue Topaz widgets: element picker + sticky "last user request" badge.
 * 原生移植自注入版 bluetopaz.js 的两个调试/辅助组件。
 */

const PICK_BTN_ID = "bt-picker-btn"
const PICK_PANEL_ID = "bt-picker-panel"
const PICK_TIP_ID = "bt-pick-tip"
const STICKY_ID = "bt-sticky"

function cssSelector(el: Element): string {
  const parts: string[] = []
  let n: Element | null = el
  while (n && n.nodeType === 1 && n !== document.documentElement && parts.length < 6) {
    if (n.id) {
      parts.unshift("#" + CSS.escape(n.id))
      break
    }
    let s = n.tagName.toLowerCase()
    const dc = n.getAttribute("data-component")
    const ds = n.getAttribute("data-slot")
    if (dc) s += `[data-component="${dc}"]`
    else if (ds) s += `[data-slot="${ds}"]`
    const p = n.parentElement
    if (p) {
      const same = Array.from(p.children).filter(c => c.tagName === n.tagName)
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(n) + 1})`
    }
    parts.unshift(s)
    n = p
  }
  return parts.join(" > ")
}

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

export function BlueTopazWidgets() {
  // ---- 拾取器 ----
  const [picking, setPicking] = createSignal(false)
  const [tipText, setTipText] = createSignal("")
  const [tipPos, setTipPos] = createSignal({ x: 0, y: 0 })
  const [panelSel, setPanelSel] = createSignal("")
  const [panelHtml, setPanelHtml] = createSignal("")
  const [panelOpen, setPanelOpen] = createSignal(false)

  let lastHl: Element | null = null
  let savedOutline = ""

  function setHover(el: Element | null) {
    if (lastHl) {
      lastHl.style.outline = savedOutline
      lastHl = null
    }
    if (!el) return
    lastHl = el
    savedOutline = el.style.outline || ""
    el.style.outline = "2px solid #d58000"
    el.style.outlineOffset = "-1px"
    const r = el.getBoundingClientRect()
    setTipText(cssSelector(el).slice(0, 90))
    setTipPos({ x: Math.max(6, Math.min(r.left, window.innerWidth - 340)), y: Math.max(6, r.top - 26) })
  }

  function clearHover() {
    if (lastHl) {
      lastHl.style.outline = savedOutline
      lastHl = null
    }
  }

  function stopPick() {
    setPicking(false)
    document.body.classList.remove("bt-picking")
    document.removeEventListener("mouseover", onOver, true)
    document.removeEventListener("click", onClickCapture, true)
    document.removeEventListener("keydown", onKey, true)
    clearHover()
  }

  function onOver(e: MouseEvent) {
    const t = e.target as Element | null
    if (!t || t.nodeType !== 1) return
    if (t.closest(`#${PICK_BTN_ID},#${PICK_PANEL_ID},#${PICK_TIP_ID}`)) return
    if (lastHl === t) return
    setHover(t)
  }

  function onClickCapture(e: MouseEvent) {
    const t = e.target as Element | null
    if (!t || t.nodeType !== 1) return
    if (t.closest(`#${PICK_BTN_ID},#${PICK_PANEL_ID},#${PICK_TIP_ID}`)) return
    e.stopPropagation()
    e.preventDefault()
    const el = lastHl ?? t
    setPanelSel(cssSelector(el))
    setPanelHtml(el.outerHTML.slice(0, 6000))
    setPanelOpen(true)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation()
      setPanelOpen(false)
      stopPick()
      return
    }
    // ↑ 切父级 / ↓ 返回子级
    if (e.key === "ArrowUp" && lastHl?.parentElement && lastHl.parentElement !== document.documentElement) {
      e.preventDefault(); e.stopPropagation()
      const parent = lastHl.parentElement
      setHover(parent)
    }
  }

  function togglePicker() {
    const next = !picking()
    setPicking(next)
    document.body.classList.toggle("bt-picking", next)
    if (next) {
      document.addEventListener("mouseover", onOver, true)
      document.addEventListener("click", onClickCapture, true)
      document.addEventListener("keydown", onKey, true)
    } else {
      stopPick()
    }
  }

  /** <> 按钮定位：贴在输入框工具条参考按钮的左侧，尺寸与其一致，垂直对齐。返回是否成功 */
  function positionPicker(): boolean {
    const btn = document.getElementById(PICK_BTN_ID)
    if (!btn) return false
    const host = getHostPanel()
    if (!host) return false
    const hr = host.getBoundingClientRect()
    if (hr.width === 0) return false
    const ref =
      document.querySelector(
        'form[data-component="prompt-input-v2"] > div:nth-of-type(2) > div[data-component="tooltip-v2-trigger"]:nth-of-type(2) > button[data-component="icon-button"]',
      ) ?? document.querySelector('form[data-component="prompt-input-v2"] [data-component="icon-button"]')
    if (!ref) return false
    const rr = ref.getBoundingClientRect()
    if (rr.width === 0 || rr.height === 0) return false

    const w = Math.round(rr.width)
    const h = Math.round(rr.height)
    // 水平对齐参考按钮（host 相对坐标）
    const left = Math.round(rr.left - hr.left)
    const top = Math.round(rr.top - hr.top)

    const want = `abs|${w}|${h}|${left}|${top}`
    if (btn.dataset.btPos === want) return true
    btn.dataset.btPos = want

    btn.style.position = "absolute"
    btn.style.width = `${w}px`
    btn.style.height = `${h}px`
    btn.style.left = `${left}px`
    btn.style.top = `${top}px`
    btn.style.right = "auto"
    btn.style.bottom = "auto"
    return true
  }

  const tryPositionLoop = (n: number): void => {
    if (!positionPicker() && n > 0) window.setTimeout(() => tryPositionLoop(n - 1), 400)
  }

  // ---- 粘性"最近用户请求"徽章 ----
  const [stickyVisible, setStickyVisible] = createSignal(false)
  const [stickyText, setStickyText] = createSignal("")
  const [stickyPos, setStickyPos] = createSignal({ right: 10, top: 8 })
  let stickyTarget: Element | null = null

  // ---- 会话状态栏 ----
  const [statsText, setStatsText] = createSignal("")
  const [statsVisible, setStatsVisible] = createSignal(false)
  const [statsPos, setStatsPos] = createSignal({ left: 0, bottom: 0 })

  function fmtTok(n: number): string {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
    return String(n)
  }

  async function loadSessionStats() {
    try {
      const api = window.api as { awaitInitialization?: () => Promise<{ url: string; username: string; password: string }> }
      if (!api?.awaitInitialization) return
      const ready = await api.awaitInitialization()
      const base = String(ready.url).replace(/\/$/, "")
      const auth = "Basic " + btoa(ready.username + ":" + ready.password)
      const r = await fetch(base + "/session?limit=200", { headers: { Authorization: auth } })
      const arr = (await r.json()) as Array<{ tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }>
      let ti = 0, to = 0, cr = 0, cw = 0
      for (const s of arr) {
        const t = s.tokens
        if (!t) continue
        ti += t.input || 0
        to += t.output || 0
        cr += t.cache?.read || 0
        cw += t.cache?.write || 0
      }
      const denom = cr + cw + ti
      const hit = denom > 0 ? Math.round((cr / denom) * 100) : 0
      setStatsText(
        `${arr.length} 会话 · 输入 ${fmtTok(ti)} tok · 输出 ${fmtTok(to)} tok · 缓存命中 ${hit}%`,
      )
      setStatsVisible(true)
      // 定位统一由 updateSticky 管理（侧栏左下竖排），此处只更新文本
    } catch {}
  }

  function findScroller(): HTMLElement | null {
    const turn = document.querySelector('[data-component="session-turn"]')
    for (const c of document.querySelectorAll(".scroll-view__viewport")) {
      if (!turn || c.contains(turn)) return c as HTMLElement
    }
    return null
  }

  // 用户消息文本登记簿：路过视口即记录，虚拟化卸载后徽章仍可显示
  const umHistory: string[] = []
  function rememberUm(el: Element) {
    const body = el.querySelector('[data-slot="user-message-body"],[data-component="user-message-body"]')
    const t = ((body ?? el).textContent || "").replace(/\s+/g, " ").trim()
    if (t && umHistory[0] !== t) umHistory.unshift(t.slice(0, 60))
    if (umHistory.length > 30) umHistory.length = 30
  }

  /** 侧栏容器：从滚动器向上爬祖先找 @container 可折叠面板（结构稳定） */
  function resolveSidebar(): HTMLElement | null {
    const sc = findScroller()
    let n: HTMLElement | null = sc
    while (n && n.tagName !== "MAIN") {
      if (n.className && String(n.className).includes("@container")) return n
      n = n.parentElement
    }
    return (document.querySelector(
      'main div[class*="@container"][class*="transition-[width]"]',
    ) as HTMLElement | null) ?? null
  }

  function updateSticky() {
    // 非对话页面（Git 面板等）隐藏全部 widgets
    // 判定强化：scroller 必须真实包含会话回合（Git 面板等视图也有滚动区，会误判）
    const sc0 = findScroller()
    const hasSession = !!(sc0 && sc0.querySelector("[data-component='session-turn']"))
    const btRootEl = document.getElementById("bt-widgets-root")
    if (btRootEl) btRootEl.style.display = hasSession ? "" : "none"
    if (!hasSession) { setStickyVisible(false); return }
    positionPicker()
    updateSeqBar()
    // 状态栏定位：下沿对齐 dock 内容区（gap-3 容器）的下缘（面板相对坐标）
    const dock = document.querySelector('[data-component="session-prompt-dock"]')
    const alignEl = dock?.querySelector(".flex.flex-col.gap-3") as HTMLElement | null
    if (alignEl) {
      const ar = alignEl.getBoundingClientRect()
      const hpr = getHostPanel()?.getBoundingClientRect()
      if (ar.height > 0 && hpr) {
        const want = {
          left: Math.round(ar.left - hpr.left - 38),
          bottom: Math.round(hpr.bottom - ar.bottom),
        }
        setStatsPos(prev => (prev.left === want.left && prev.bottom === want.bottom) ? prev : want)
      }
    }
    const sc = findScroller()
    if (!sc) { setStickyVisible(false); return }
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
    if (!text && umHistory[0]) {
      // 兜底：目标回合已被虚拟化卸载——显示登记簿里最近的用户消息，
      // 点击退回最顶上的已挂载回合（近似定位）
      setStickyText("↩ " + (umHistory[0].slice(0, 58)))
      setStickyVisible(true)
      return
    }
    setStickyText(text.slice(0, 60))
    // 徽章贴着滚动区内渐变 sticky 头的下沿（找不到头则回退到视口顶 +8）
    const stHeader = sc.querySelector(":scope > div.sticky.top-0") as HTMLElement | null
    const badgeTop = stHeader ? Math.round(stHeader.getBoundingClientRect().bottom + 4) : Math.round(sr.top + 8)
    // 徽章钉在滚动视口右上角内侧，坐标转为面板相对系（widgets 根已迁入面板）
    var hrPanel = getHostPanel()?.getBoundingClientRect()
    var badgeRight = hrPanel ? Math.max(10, Math.round(hrPanel.right - sr.right + 12)) : 12
    setStickyPos(prev => (prev.right === badgeRight && prev.top === badgeTop) ? prev : { right: badgeRight, top: badgeTop })
    setStickyVisible(true)
  }

  // 序列条数据：从 sidecar API 加载当前会话的用户输入历史（最近20条）
  const [seqEntries, setSeqEntries] = createSignal<Array<{ id: string; text: string; absIdx: number }>>([])
  const [seqTop, setSeqTop] = createSignal(0)
  let umTotal = 0 // 会话用户消息总数（API 统计）
  let seqSessionId: string | null = null

  /** 宿主面板：widgets 的定位基准（@container 可折叠面板） */
  function getHostPanel(): HTMLElement | null {
    const root = document.getElementById("bt-widgets-root")
    if (root?.parentElement && root.parentElement.classList.contains("bt-host-panel"))
      return root.parentElement
    // 回退：按结构解析
    const mainEl = document.querySelector("#root main")
    let c: Element | null = mainEl
    for (let d = 0; d < 3 && c; d++) c = c.children[0] ?? null
    return (c as HTMLElement) ?? null
  }

  function extractUmText(el: Element): string {
    const b = el.querySelector('[data-slot="user-message-body"],[data-component="user-message-body"]')
    return ((b ?? el).textContent || "").replace(/\s+/g, " ").trim()
  }

  /** 从 sidecar API 加载当前会话的用户消息文本，返回 {texts, total} */
  async function loadUmHistoryFromApi(): Promise<string[]> {
    const api = (window as any).api
    if (!api?.awaitInitialization) return []
    const ready = await api.awaitInitialization()
    const base = String(ready.url).replace(/\/$/, "")
    const auth = "Basic " + btoa((ready.username || "opencode") + ":" + (ready.password || ""))
    // 最新更新的会话
    const r1 = await fetch(base + "/session?limit=1", { headers: { Authorization: auth } })
    const arr = await r1.json()
    const sid = arr[0]?.id
    if (!sid) return []
    seqSessionId = sid
    // 该会话全部消息 → 用户消息文本
    const r2 = await fetch(base + "/session/" + sid + "/message", { headers: { Authorization: auth } })
    const msgs = await r2.json()
    const texts: string[] = []
    for (const m of msgs) {
      if (m.info?.role !== "user") continue
      let t = ""
      if (m.parts) {
        for (const p of m.parts) {
          if (p.type === "text" && p.text) { t = p.text; break }
        }
      }
      const clean = t.replace(/\s+/g, " ").trim()
      if (clean) texts.push(clean.slice(0, 60))
    }
    umTotal = texts.length
    // 填充序列条数据（最近 20 条用户输入）
    setSeqEntries(texts.slice(-20).map((t, i) => ({ id: "api" + i, text: t })))
    return texts
  }

  /** 序列条刷新：仅重算位置；数据由 API 周期加载，非会话视图保留现有条目 */
  function updateSeqBar() {
    const sc = findScroller()
    if (!sc || seqEntries().length === 0) return
    const sr = sc.getBoundingClientRect()
    const n = seqEntries().length
    setSeqTop(Math.round(sr.top + sr.height / 2 - (n * 13 - 4) / 2))
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

  function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }) }

  /** 跳转到登记序号为 seqIdx 的用户输入（虚拟化环境下逐屏逼近） */
  async function scrollToSeqEntry(seqIdx: number) {
    const total = seqEntries().length
    if (!total) return
    for (var attempt = 0; attempt < 8; attempt++) {
      var sc = findScroller()
      if (!sc) { await sleep(250); continue }
      var ums = Array.from(sc.querySelectorAll("[data-component=user-message]")).filter(
        function(u){ return u.getBoundingClientRect().height > 8 }
      )
      if (!ums.length) { await sleep(250); continue }
      var m = ums.length
      var firstGlobal = total - m
      var lastGlobal = total - 1
      if (seqIdx >= firstGlobal && seqIdx <= lastGlobal) {
        ums[seqIdx - firstGlobal].scrollIntoView({ behavior: "smooth", block: "center" })
        return
      }
      if (seqIdx < firstGlobal) {
        sc.scrollTop -= sc.clientHeight * 0.75
      } else {
        sc.scrollTop += sc.clientHeight * 0.75
      }
      await sleep(320)
    }
  }

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

  const onResize = () => { positionPicker(); updateSticky() }

  onMount(() => {
    const mo = new MutationObserver(() => { positionPicker(); updateSticky() })
    mo.observe(document.body, { childList: true, subtree: true })
    let sc: HTMLElement | null = null
    const attach = () => {
      sc = findScroller()
      sc?.addEventListener("scroll", updateSticky, { passive: true })
    }
    attach()
    setTimeout(attach, 1500)
    setTimeout(attach, 5000)
    window.addEventListener("resize", onResize)
    // 输入框表单挂载晚于组件 mount——重试定位直到锚点出现
    tryPositionLoop(25)
    updateSticky()
    void loadSessionStats()
    // 历史加载重试：启动早期可能失败（server 未就绪等），指数退避重试
    const retryHistory = (n: number) => {
      loadUmHistoryFromApi().then(updateSeqBar).catch(() => {
        if (n > 0) setTimeout(() => retryHistory(n - 1), 2000)
      })
    }
    retryHistory(5)
    // 状态栏低频刷新（tokens 聚合随会话增长）+ 序列条同步刷新
    const statsIv = setInterval(() => { loadSessionStats(); loadUmHistoryFromApi().then(updateSeqBar) }, 10000)
    window.__btCleanup?.push(() => clearInterval(statsIv))

    onCleanup(() => {
      mo.disconnect()
      sc?.removeEventListener("scroll", updateSticky)
      window.removeEventListener("resize", onResize)
      stopPick()
    })
  })

  return (
    <>
      <Show when={picking()}>
        <div id={PICK_TIP_ID} style={{ left: `${tipPos().x}px`, top: `${tipPos().y}px` }}>{tipText()}</div>
      </Show>
      <button
        type="button"
        id={PICK_BTN_ID}
        class="size-7 rounded-md p-[6px] text-v2-icon-icon-muted shadow-[var(--v2-elevation-button-contrast)]"
        classList={{ "bt-active": picking() }}
        title="Pick element: hover to highlight, click to capture selector + HTML. ArrowUp = parent."
        onClick={togglePicker}
      >
        {"<>"}
      </button>
      <div
        id="bt-statsbar"
        style={{
          left: `${statsPos().left}px`,
          bottom: `${statsPos().bottom}px`,
          visibility: statsVisible() ? "visible" : "hidden",
        }}
      >
        {statsText()}
      </div>
      <Show when={panelOpen()}>
        <div id={PICK_PANEL_ID}>
          <div class="bt-panel-head">
            <span>Element Inspector</span>
            <button type="button" data-act="close" onClick={() => setPanelOpen(false)}>×</button>
          </div>
          <label>Selector</label>
          <div class="bt-row">
            <input readonly value={panelSel()} />
            <button type="button" onClick={() => copyText(panelSel())}>Copy</button>
          </div>
          <label>outerHTML</label>
          <textarea readonly rows={8} spellcheck={false} value={panelHtml()} />
          <div class="bt-row">
            <button type="button" onClick={() => copyText(panelHtml())}>Copy HTML</button>
            <span class="bt-hint">Esc to exit pick mode</span>
          </div>
        </div>
      </Show>
      <button
        type="button"
        id={STICKY_ID}
        classList={{ "bt-sticky-empty": !stickyText() }}
        style={{ right: `${stickyPos().right}px`, top: `${stickyPos().top}px` }}
        title="Last user request - click to scroll back"
        onClick={scrollBack}
      >{"↩ " + stickyText()}</button>
      <Show when={seqEntries().length > 0}>
        <div id="bt-seqbar" style={{ top: `${seqTop()}px` }}>
          {seqEntries().map((e, clickedIdx) => (
            <button
              type="button"
              class="bt-seq-bar"
              title={e.text}
              onClick={() => { scrollToSeqEntry(clickedIdx) }}
            >
              <span class="bt-seq-tip">{e.text}</span>
            </button>
          ))}
        </div>
      </Show>
    </>
  )
}
