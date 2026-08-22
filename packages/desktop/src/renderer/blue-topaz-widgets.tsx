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

  // ---- 粘性"最近用户请求"徽章 ----
  const [stickyVisible, setStickyVisible] = createSignal(false)
  const [stickyText, setStickyText] = createSignal("")
  let stickyTarget: Element | null = null

  function findScroller(): HTMLElement | null {
    const turn = document.querySelector('[data-component="session-turn"]')
    for (const c of document.querySelectorAll(".scroll-view__viewport")) {
      if (!turn || c.contains(turn)) return c as HTMLElement
    }
    return null
  }

  function updateSticky() {
    const sc = findScroller()
    if (!sc) { setStickyVisible(false); return }
    const ums = Array.from(sc.querySelectorAll("[data-component='user-message']")).filter(
      u => u.getBoundingClientRect().height > 8,
    )
    if (ums.length === 0) { setStickyVisible(false); return }
    const sr = sc.getBoundingClientRect()
    let lastAbove: Element | null = null
    let anyVisible = false
    for (const u of ums) {
      const r = u.getBoundingClientRect()
      if (r.bottom > sr.top && r.top < sr.bottom) { anyVisible = true; break }
      if (r.top <= sr.top) lastAbove ??= u
    }
    if (anyVisible || !lastAbove) { setStickyVisible(false); return }
    stickyTarget = lastAbove
    const bodyEl = lastAbove.querySelector('[data-slot="user-message-body"],[data-component="user-message-body"]')
    const text = ((bodyEl ?? lastAbove).textContent || "").replace(/\s+/g, " ").trim()
    setStickyText(text.slice(0, 60))
    setStickyVisible(true)
  }

  function scrollBack() {
    if (stickyTarget && findScroller()?.contains(stickyTarget)) {
      stickyTarget.scrollIntoView({ behavior: "smooth", block: "start" })
    } else {
      const sc = findScroller()
      const turns = sc?.querySelectorAll("[data-component='session-turn']")
      if (turns && turns.length) turns[0].scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  onMount(() => {
    const mo = new MutationObserver(() => updateSticky())
    mo.observe(document.body, { childList: true, subtree: true })
    let sc: HTMLElement | null = null
    const attach = () => {
      sc = findScroller()
      sc?.addEventListener("scroll", updateSticky, { passive: true })
    }
    attach()
    setTimeout(attach, 1500)
    setTimeout(attach, 5000)
    window.addEventListener("resize", updateSticky)
    updateSticky()

    onCleanup(() => {
      mo.disconnect()
      sc?.removeEventListener("scroll", updateSticky)
      window.removeEventListener("resize", updateSticky)
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
        classList={{ "bt-active": picking() }}
        title="Pick element: hover to highlight, click to capture selector + HTML. ArrowUp = parent."
        onClick={togglePicker}
      >
        {"<>"}
      </button>
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
      <Show when={stickyVisible()}>
        <button
          type="button"
          id={STICKY_ID}
          title="Last user request - click to scroll back"
          onClick={scrollBack}
        >{"↩ " + stickyText()}</button>
      </Show>
    </>
  )
}
