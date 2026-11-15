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

/** Rects change on scroll and streaming; panels move with them, at a low, steady rate. */
const INTERVAL_MS = 150

/** List items paint their sheet 24px left of the box so the marker sits on it. */
const MARKER_INSET = 24

export function createHudGlass(input: {
  enabled: () => boolean
  /** The unfocused transcript fades after its top half; only the opaque part gets panels. */
  topOnly: () => boolean
  send: (panels: readonly HudGlassPanel[]) => Promise<void>
}) {
  let timer: ReturnType<typeof setInterval> | undefined
  let last = ""

  const read = () => {
    const panels = collect(input.topOnly())
    const key = JSON.stringify(panels)

    if (key === last) return
    last = key
    void input.send(panels).catch(() => undefined)
  }

  const stop = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined

    if (!last) return
    last = ""
    void input.send([]).catch(() => undefined)
  }

  createEffect(() => {
    if (!input.enabled()) return stop()

    read()
    timer = setInterval(read, INTERVAL_MS)
    onCleanup(() => {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    })
  })

  onCleanup(stop)
}

function collect(topOnly: boolean) {
  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight
  const panels: HudGlassPanel[] = []
  const scroll = topOnly ? document.querySelector<HTMLElement>('[data-slot="session-timeline-scroll"]') : null
  const scrollBox = scroll?.getBoundingClientRect()
  // The unfocused mask keeps the top half at full strength and clears by the midpoint.
  const limit = scrollBox ? scrollBox.top + scrollBox.height * 0.45 : Number.POSITIVE_INFINITY

  for (const element of document.querySelectorAll<HTMLElement>(SURFACES)) {
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
    panels.push({
      x: Math.round((window.screenX + left) * dpr),
      y: Math.round((window.screenY + top) * dpr),
      width: Math.round((right - left) * dpr),
      height: Math.round((bottom - top) * dpr),
      radius: component === "composer" ? 12 : component === "read-tool-group" ? Math.min(999, (bottom - top) / 2) : 6,
      dpr,
    })

    if (panels.length >= LIMIT) break
  }

  return panels
}
