import { createEffect, onCleanup } from "solid-js"
import type { HudGlassPanel } from "@/runtime/platform/platform"

/**
 * Surfaces that paint the 80% sheet in the HUD. Each one gets a native glass panel behind it so the
 * desktop comes through blurred instead of flat. Kept in sync with the `--hud-frost` rule in hud.css.
 */
const SURFACES = [
  '[data-hud] [data-component="composer"]',
  '[data-hud] [data-component="accordion"][data-scope="apply-patch"] [data-slot="accordion-trigger"]',
  '[data-hud] [data-component="user-message"] [data-slot="user-message-text"]',
  '[data-hud] [data-component="session-working"]',
  '[data-hud] [data-component="task-tool-card"]',
  '[data-hud-transcript] [data-component="markdown"] p',
  '[data-hud-transcript] [data-component="markdown"] blockquote',
  '[data-hud-transcript] [data-component="markdown"] pre',
  '[data-hud-transcript] [data-component="markdown"] li',
  '[data-hud-transcript] [data-component="tool-trigger"][data-pill-kind]',
  '[data-hud-transcript] [data-component="read-tool-group"]',
  '[data-hud-transcript] [data-slot="text-part-meta"]',
].join(", ")

/** Native panels are real windows; keep the count bounded. */
const LIMIT = 24

/** Streaming and layout changes refresh here; scrolling uses a frame-synced read instead. */
const INTERVAL_MS = 150

/** List items paint their sheet 24px left of the box so the marker sits on it. */
const MARKER_INSET = 24

export function createHudGlass(input: {
  enabled: () => boolean
  /** The unfocused transcript fades after its top half; only the opaque part gets panels. */
  topOnly: () => boolean
  /** Minimal mode keeps a panel behind the composer and the tool capsules; prose stays clear. */
  onlyComposer?: () => boolean
  send: (panels: readonly HudGlassPanel[]) => Promise<void>
}) {
  let timer: ReturnType<typeof setInterval> | undefined
  let frame: number | undefined
  let active = false
  let last = ""

  const read = () => {
    const panels = collect(input.topOnly(), input.onlyComposer?.() ?? false)
    const key = JSON.stringify(panels)

    if (key === last) return
    last = key
    void input.send(panels).catch(() => undefined)
  }

  // Scrolling moves every surface at frame rate; the slow interval would leave the panels a trail
  // behind the text. Scroll events schedule the same read on the next painted frame.
  const schedule = () => {
    if (!active || frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      if (active) read()
    })
  }

  const onScroll = () => schedule()

  window.addEventListener("scroll", onScroll, { capture: true, passive: true })
  onCleanup(() => {
    window.removeEventListener("scroll", onScroll, { capture: true })
    if (frame !== undefined) cancelAnimationFrame(frame)
  })

  const stop = () => {
    active = false

    if (timer !== undefined) clearInterval(timer)
    timer = undefined

    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined

    if (!last) return
    last = ""
    void input.send([]).catch(() => undefined)
  }

  createEffect(() => {
    if (!input.enabled()) return stop()

    active = true
    read()
    timer = setInterval(read, INTERVAL_MS)
    onCleanup(() => {
      active = false

      if (timer !== undefined) clearInterval(timer)
      timer = undefined

      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
    })
  })

  onCleanup(stop)
}

function isCapsule(element: HTMLElement) {
  return element.matches(
    [
      '[data-component="tool-trigger"][data-pill-kind]',
      '[data-component="read-tool-group"]',
      '[data-component="accordion"][data-scope="apply-patch"] [data-slot="accordion-trigger"]',
    ].join(", "),
  )
}

function collect(topOnly: boolean, onlyComposer: boolean) {
  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight
  const panels: HudGlassPanel[] = []
  const scroll = topOnly ? document.querySelector<HTMLElement>('[data-slot="session-timeline-scroll"]') : null
  const scrollBox = scroll?.getBoundingClientRect()
  // The unfocused mask keeps the top half at full strength and clears by the midpoint.
  const limit = scrollBox ? scrollBox.top + scrollBox.height * 0.45 : Number.POSITIVE_INFINITY

  for (const element of document.querySelectorAll<HTMLElement>(SURFACES)) {
    if (onlyComposer && element.getAttribute("data-component") !== "composer" && !isCapsule(element)) continue
    // A paragraph inside a list item has no sheet of its own; the item's panel covers it.
    if (element.closest("li") && element.tagName !== "LI") continue
    // Nested lists sit inside the outer item's panel.
    if (element.tagName === "LI" && element.parentElement?.closest("li")) continue
    const rect = element.getBoundingClientRect()
    const left = Math.max(0, element.tagName === "LI" ? rect.left - MARKER_INSET : rect.left)
    const top = Math.max(0, rect.top)
    const right = Math.min(width, rect.right)
    const bottom = Math.min(height, rect.bottom, scroll && scroll.contains(element) ? limit : Number.POSITIVE_INFINITY)

    if (right - left < 4 || bottom - top < 4) continue
    const component = element.getAttribute("data-component")
    // The native panel rounds and anti-aliases to its own bounds. Keep the read capsule's glass a
    // pixel inside the pill, and round edges inward everywhere, so the blur can never show past the
    // fill's rounded outline (the capsule's ends made even a sub-pixel overhang obvious).
    const inset = component === "read-tool-group" ? 1 : 0
    const x = Math.ceil((window.screenX + left + inset) * dpr)
    const y = Math.ceil((window.screenY + top + inset) * dpr)
    const panelWidth = Math.floor((window.screenX + right - inset) * dpr) - x
    const panelHeight = Math.floor((window.screenY + bottom - inset) * dpr) - y

    if (panelWidth < 1 || panelHeight < 1) continue
    panels.push({
      x,
      y,
      width: panelWidth,
      height: panelHeight,
      radius: component === "composer" ? 12 : component === "read-tool-group" ? Math.min(999, (bottom - top - inset * 2) / 2) : 6,
      dpr,
    })

    if (panels.length >= LIMIT) break
  }

  return panels
}
