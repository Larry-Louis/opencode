/**
 * Per-window HUD context for the next prompt. This module lives in the HUD renderer only: the main
 * window never sets it, so a prompt typed there is untouched. Keeping it outside Solid state lets
 * the composer read it without importing the HUD's UI or context.
 */

export type HudContext = {
  /** A model-facing sentence prepended to the user's prompt. */
  note: string
  image?: {
    dataUrl: string
    mime: string
    name: string
  }
  window?: {
    app: string
    title: string
    bounds: { x: number; y: number; width: number; height: number }
    id: number
    pid: number
  }
  frontmost?: { app: string; title: string }
  platform?: string
}

export const HUD_NOTE =
  "[HUD context: this message came from the floating HUD. An unqualified \"this\", \"here\" or \"that page\" usually means the screen behind the HUD, not anything inside OpenCode. They move the HUD between apps mid-conversation, so an app named on an earlier turn may still be the target; a reference that does not fit the current window may name an earlier one. This is a prior, not a rule: when the request names its own target, follow it. No screenshot is attached unless this message includes one.]"

let current: HudContext | null = null

const listeners = new Set<(value: HudContext | null) => void>()

export function setHudContext(value: HudContext | null) {
  current = value

  for (const listener of listeners) listener(value)
}

export function readHudContext() {
  return current
}

/** The server reporter lives below the session provider; the frame itself sits above it. */
export function subscribeHudContext(listener: (value: HudContext | null) => void) {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

/** The model-facing prompt body: the HUD note first, then the words the user typed. */
export function withHudNote(note: string | undefined, text: string) {
  return note ? `${note}\n\n${text}` : text
}

const INCLUDE_SCREEN_KEY = "opencode.hud.includeScreen"

/** Screenshots are opt-in per device; the HUD bar itself is always the context. */
export function readIncludeScreen() {
  try {
    return localStorage.getItem(INCLUDE_SCREEN_KEY) === "1"
  } catch {
    return false
  }
}

export function writeIncludeScreen(enabled: boolean) {
  try {
    localStorage.setItem(INCLUDE_SCREEN_KEY, enabled ? "1" : "0")
  } catch {}
}
