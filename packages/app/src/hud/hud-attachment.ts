/**
 * Per-window HUD context for the next prompt. This module lives in the HUD renderer only: the main
 * window never sets it, so a prompt typed there is untouched. Keeping it outside Solid state lets
 * the composer read it without importing the HUD's UI or context.
 */

export type HudContext = {
  /** A model-facing sentence prepended to the user's prompt. */
  readonly note: string
  readonly image?: {
    readonly dataUrl: string
    readonly mime: string
    readonly name: string
  }
}

export const HUD_NOTE =
  "[HUD context: this message came from the floating HUD. An unqualified \"this\", \"here\" or \"that page\" usually means the screen behind the HUD, not anything inside OpenCode. No screenshot is attached unless this message includes one.]"

let current: HudContext | null = null

export function setHudContext(value: HudContext | null) {
  current = value
}

export function readHudContext() {
  return current
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
