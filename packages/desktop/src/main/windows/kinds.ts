import type { BrowserWindow } from "electron"

// The HUD is a window the app owns but not a "main window": it is never persisted, restored or
// offered to plugins as a place to put panes. Keep its identity in one WeakSet rather than adding a
// property to BrowserWindow.
const hudWindows = new WeakSet<BrowserWindow>()

export function markHudWindow(win: BrowserWindow) {
  hudWindows.add(win)

  return win
}

export function isHudWindow(win: BrowserWindow | null | undefined) {
  return !!win && hudWindows.has(win)
}
