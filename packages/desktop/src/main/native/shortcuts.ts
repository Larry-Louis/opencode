import { globalShortcut } from "electron"
import type { HudController } from "../windows/hud"

const TOGGLE = "CommandOrControl+Shift+H"

const SNAP = "CommandOrControl+Shift+G"

/**
 * Global shortcuts are registered in main because the renderer's keybind system only sees keys
 * while one of our windows has focus. A failed registration is not fatal: the menu item and the
 * in-app button remain available.
 */
export function registerHudShortcuts(hud: HudController) {
  const registered: string[] = []

  const register = (accelerator: string, run: () => void) => {
    try {
      if (globalShortcut.register(accelerator, run)) registered.push(accelerator)
      else console.warn(`[hud] global shortcut is already taken: ${accelerator}`)
    } catch (error) {
      console.warn(`[hud] global shortcut registration failed: ${accelerator}`, error)
    }
  }

  register(TOGGLE, () => hud.toggle())
  register(SNAP, () => hud.snapToPointer())

  return () => {
    for (const accelerator of registered) {
      try {
        globalShortcut.unregister(accelerator)
      } catch {}
    }

    registered.length = 0
  }
}
