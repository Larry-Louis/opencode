import { onCleanup, onMount } from "solid-js"
import { widgetHost } from "./blue-topaz-host"

/**
 * One "collapse thinking" button after every finished turn that still shows reasoning, in the chat
 * panel's coordinate space.
 *
 * The timeline is virtualized and the panel drops children it does not own, so the buttons live in
 * the fork's own host element: a small pool of detached buttons is positioned over the panel and
 * re-attached if Solid rebuilds the panel beneath them.
 */

/** The button's class and copy, styled by `styles.css`. */
const THINK_COLLAPSE_CLASS = "bt-think-collapse"

const THINK_COLLAPSE_TEXT = "折叠思考"

/** Keeps the host inside the chat panel so the buttons move with it; the panel drops foreign children. */
function ensureRootHost() {
  if (!widgetHost.isConnected) document.documentElement.appendChild(widgetHost)
  const panel = document.querySelector<HTMLElement>('[data-slot="session-chat-panel"]')
  const parent: HTMLElement = panel ?? document.documentElement

  if (widgetHost.parentElement !== parent) parent.appendChild(widgetHost)
  panel?.classList.add("bt-host-panel")
}

function findScroller(): HTMLElement | null {
  const turn = document.querySelector('[data-component="session-turn"]')

  for (const candidate of document.querySelectorAll<HTMLElement>(".scroll-view__viewport"))
    if (!turn || candidate.contains(turn)) return candidate

  return null
}

/** Coordinates are relative to the host, which fills the panel. */
function hostBox() {
  const rect = widgetHost.getBoundingClientRect()

  if (!rect || rect.width === 0) return { left: 0, top: 0 }

  return { left: rect.left, top: rect.top }
}

/** The timeline's rows, cut into turns: every user message starts one. */
function timelineRounds(scroller: HTMLElement) {
  const rounds: HTMLElement[][] = []
  let current: HTMLElement[] | null = null

  for (const row of scroller.querySelectorAll<HTMLElement>("[data-timeline-row]")) {
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

/** A turn with a streaming reply, pending input, a tool or reasoning still running, or the working turn. */
function roundRunning(round: HTMLElement[]) {
  return round.some((row) =>
    row.querySelector(
      '[data-streaming], [data-pending="true"], [data-component="text-shimmer"][data-active="true"], [data-slot="session-turn-assistant-content"][aria-hidden="true"]',
    ),
  )
}

function expandedReasoning(row: HTMLElement) {
  return row.querySelector(
    '[data-component="reasoning-part"] [data-slot="collapsible-trigger"][aria-expanded="true"]',
  )
}

/** Clicks the app's own triggers, so the disclosure state stays the timeline's. */
function collapseRoundThinking(round: HTMLElement[]) {
  for (const row of round)
    for (const trigger of row.querySelectorAll<HTMLElement>(
      '[data-component="reasoning-part"] [data-slot="collapsible-trigger"][aria-expanded="true"]',
    ))
      trigger.click()
}

export function BlueTopazThinking() {
  const buttons: HTMLButtonElement[] = []
  let observer: MutationObserver | undefined
  let resize: ResizeObserver | undefined
  let observedScroller: HTMLElement | null = null
  let frame = 0

  // Scroll, resize and row churn all land in one frame's measurement.
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      update()
    })
  }

  const buttonAt = (index: number) => {
    const existing = buttons[index]

    if (existing) return existing
    const button = document.createElement("button")
    button.type = "button"
    button.className = THINK_COLLAPSE_CLASS
    button.textContent = THINK_COLLAPSE_TEXT
    widgetHost.appendChild(button)
    buttons[index] = button

    return button
  }

  function update() {
    ensureRootHost()
    const scroller = findScroller()

    if (scroller !== observedScroller) syncObservers(scroller)

    if (!scroller) {
      widgetHost.style.display = "none"

      for (const button of buttons) button.style.display = "none"

      return
    }

    widgetHost.style.display = ""
    const host = hostBox()
    const wanted: Array<{ round: HTMLElement[]; left: number; top: number }> = []

    for (const round of timelineRounds(scroller)) {
      if (roundRunning(round)) continue

      if (!round.some(expandedReasoning)) continue
      const rect = round[round.length - 1]!.getBoundingClientRect()

      if (rect.height <= 0) continue

      wanted.push({ round, left: Math.round(rect.left + 8 - host.left), top: Math.round(rect.bottom + 2 - host.top) })
    }

    for (const [index, item] of wanted.entries()) {
      const button = buttonAt(index)
      button.style.display = ""
      button.style.left = `${item.left}px`
      button.style.top = `${item.top}px`
      button.onclick = () => {
        collapseRoundThinking(item.round)
        update()
      }
    }

    for (let index = wanted.length; index < buttons.length; index++) buttons[index]!.style.display = "none"
  }

  const syncObservers = (scroller: HTMLElement | null) => {
    if (observedScroller === scroller) return

    if (observedScroller) {
      observedScroller.removeEventListener("scroll", update)
      resize?.unobserve(observedScroller)
    }

    observedScroller = scroller

    if (!scroller) {
      observer?.disconnect()
      observer = undefined

      return
    }

    scroller.addEventListener("scroll", schedule, { passive: true })
    resize?.observe(scroller)
    // Rows mounting, a turn finishing or a disclosure opening is all this needs. Streaming text is ignored: it changes
    // on every delta and none of it moves a button.
    observer?.disconnect()
    observer = new MutationObserver(schedule)
    observer.observe(scroller, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "data-streaming", "data-pending", "data-timeline-row"],
    })
  }

  // The chat panel is rebuilt on navigation, which takes the scroller with it. Scroll events bubble here in the capture
  // phase, so the next gesture re-binds the observers even when the old element is already gone.
  onMount(() => {
    resize = new ResizeObserver(schedule)
    window.addEventListener("resize", schedule)
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
    syncObservers(findScroller())
    update()

    onCleanup(() => {
      observer?.disconnect()
      resize?.disconnect()
      observedScroller?.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      document.removeEventListener("scroll", schedule, { capture: true })

      if (frame) cancelAnimationFrame(frame)

      for (const button of buttons) button.remove()
    })
  })

  return null
}
