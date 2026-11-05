// Bringing a window to the front has one platform trap: Electron derives the restore state for
// show() from isMaximized(), which is false while a window is minimized. Showing a minimized,
// maximized window therefore lands it on its normal bounds instead of bringing it back maximized —
// for example when a notification click returns the app from the taskbar. Restore first, and only
// show windows that are actually hidden.
type PresentableWindow = {
  isMinimized(): boolean
  isVisible(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function presentWindow(win: PresentableWindow) {
  if (win.isMinimized()) win.restore()

  if (!win.isVisible()) win.show()

  win.focus()
}
