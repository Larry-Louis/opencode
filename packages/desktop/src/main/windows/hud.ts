import { BrowserWindow, screen } from "electron"
import {
  applyHudResize,
  clampHudBounds,
  defaultHudBounds,
  hudBoundsVisible,
  snapHudBounds,
  type HudBounds,
  type HudEdge,
} from "../../shared/hud-geometry"
import { isHudWindow } from "./kinds"
import { transitionHud, type HudEvent, type HudState } from "./hud-machine"
import { captureHudContext, type HudCapture } from "./hud-context"
import { promoteHudOnHyprland } from "./hud-hyprland"
import { hudStateFile, readHudState, writeHudState } from "./hud-state"
import { resolveHudWindowing, type HudWindowing } from "./hud-windowing"
import { presentWindow } from "./present"

/** The window is forced closed this long after a graceful close, so a hung renderer cannot leave a
 *  permanently top-most bar on screen. */
const HUD_CLOSE_GRACE_MS = 1_500

/** Geometry writes are coalesced while a drag or resize is in flight. */
const HUD_PERSIST_DELAY_MS = 200

/** A HUD whose renderer never reports a theme still has to become visible. */
const HUD_SHOW_FALLBACK_MS = 3_000

export type HudController = {
  readonly toggle: (route?: string) => void
  readonly open: (route?: string) => void
  readonly close: () => void
  readonly setBounds: (bounds: HudBounds) => HudBounds
  readonly resize: (input: { start: HudBounds; edge: HudEdge; delta: { x: number; y: number } }) => HudBounds
  readonly resetLayout: () => HudBounds
  readonly snapToPointer: () => HudBounds
  readonly reportRoute: (windowID: number, route: string | undefined) => void
  readonly captureContext: (screenshot: boolean) => Promise<HudCapture>
  readonly windowing: () => HudWindowing
  readonly setWorkspaceTransfer: (enabled: boolean) => void
  readonly setIgnoreMouse: (ignore: boolean) => void
  readonly setFrost: (enabled: boolean) => void
  readonly state: () => { readonly open: boolean; readonly bounds?: HudBounds }
  readonly dispose: () => void
}

export function createHudController(input: {
  readonly userData: string
  readonly createWindow: (window: { route: string; bounds: HudBounds }) => BrowserWindow
  readonly findMainWindow: (id: number) => BrowserWindow | undefined
  readonly lastMainWindow: () => BrowserWindow | undefined
  readonly createMainWindow: () => BrowserWindow
  readonly onStateChanged?: (state: { readonly open: boolean }) => void
}): HudController {
  const stateFile = hudStateFile(input.userData)
  let state: HudState = { status: "closed", attempt: 0 }
  let announced = false
  let win: BrowserWindow | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let pendingBounds: HudBounds | undefined
  let lastRoute: string | undefined
  const routes = new Map<number, string>()

  const dispatch = (event: HudEvent) => {
    const next = transitionHud(state, event)
    state = next.state
    next.effects.forEach(perform)

    const open = state.status !== "closed"

    if (open !== announced) {
      announced = open
      input.onStateChanged?.({ open })
    }

    return next
  }

  const perform = (effect: ReturnType<typeof transitionHud>["effects"][number]) => {
    if (effect.type === "focus-main") return focusMain()

    if (effect.type === "restore-window") return restore(effect.windowID)

    if (effect.type === "close-window") return closeWindow(effect.attempt)

    createWindow(effect.attempt, effect.route)
  }

  const createWindow = (attempt: number, route: string) => {
    const bounds = resolveOpenBounds()

    let created: BrowserWindow

    try {
      created = input.createWindow({ route, bounds })
    } catch (error) {
      console.error("[hud] failed to create window", error)
      dispatch({ type: "window.failed", attempt })

      return
    }

    win = created
    created.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver")

    if (process.platform === "darwin")
      created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })

    created.once("ready-to-show", () => {
      if (created.isDestroyed()) return

      created.show()
      created.focus()
    })

    // If the renderer never reports its theme, show the bar anyway; a hidden HUD would leave the
    // app looking gone with its main window already hidden.
    const showTimer = setTimeout(() => {
      if (!created.isDestroyed() && !created.isVisible()) {
        created.show()
        created.focus()
      }
    }, HUD_SHOW_FALLBACK_MS)

    created.on("closed", () => {
      clearTimeout(closeTimer)
      clearTimeout(showTimer)
      closeTimer = undefined

      if (win === created) win = undefined

      flushBounds()
      dispatch({ type: "window.closed", attempt })
    })

    // A crashed or unloadable HUD must not leave the app with its main window hidden and no usable
    // surface.
    created.webContents.on("render-process-gone", () => {
      if (!created.isDestroyed()) created.close()
    })

    created.webContents.on("did-fail-load", (_event, _code, _description, _url, isMainFrame) => {
      if (isMainFrame && !created.isDestroyed()) created.close()
    })

    // A close that raced the create: the machine already moved to closing, so the freshly created
    // window must not stay up.
    dispatch({ type: "window.created", attempt })

    if (state.status !== "open") closeWindow(attempt)

    // Hyprland tiles new toplevels and owns always-on-top; float and pin the bar after it maps.
    if (process.env.HYPRLAND_INSTANCE_SIGNATURE) void promoteHudOnHyprland({ title: "OpenCode HUD" })
  }

  const closeWindow = (attempt: number) => {
    const current = win

    if (!current || current.isDestroyed()) {
      dispatch({ type: "window.closed", attempt })

      return
    }

    clearTimeout(closeTimer)
    closeTimer = setTimeout(() => {
      if (!current.isDestroyed()) current.destroy()
    }, HUD_CLOSE_GRACE_MS)

    current.close()
  }

  const restore = (windowID: number | undefined) => {
    const target = windowID === undefined ? input.lastMainWindow() : input.findMainWindow(windowID)

    if (target && !target.isDestroyed()) {
      // Restore the default after the HUD's hidden lifetime disabled it.
      target.webContents.setBackgroundThrottling(true)
      presentWindow(target)

      return
    }

    // The window the HUD replaced is gone. Leave the user with a normal window rather than a HUD
    // that closes into nothing.
    if (BrowserWindow.getAllWindows().every((window) => window.isDestroyed() || isHudWindow(window)))
      input.createMainWindow()
    else focusMain()
  }

  const focusMain = () => {
    const target = input.lastMainWindow()

    if (target && !target.isDestroyed()) {
      presentWindow(target)

      return
    }

    const existing = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed() && !isHudWindow(window))

    if (existing) {
      presentWindow(existing)

      return
    }

    input.createMainWindow()
  }

  const areaFor = (bounds: HudBounds) => screen.getDisplayMatching(bounds).workArea

  const resolveOpenBounds = (): HudBounds => {
    const saved = pendingBounds ?? readHudState(stateFile)
    const areas = screen.getAllDisplays().map((display) => display.workArea)

    if (saved?.x === undefined || saved.y === undefined || !saved.width || !saved.height)
      return defaultHudBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea)

    const bounds = { x: saved.x, y: saved.y, width: saved.width, height: saved.height }

    if (hudBoundsVisible(bounds, areas)) return clampHudBounds(bounds, areaFor(bounds))

    return defaultHudBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea)
  }

  const applyBounds = (bounds: HudBounds): HudBounds => {
    const applied = clampHudBounds(bounds, areaFor(bounds))

    if (win && !win.isDestroyed()) win.setBounds(applied)

    pendingBounds = applied
    schedulePersist()

    return applied
  }

  const schedulePersist = () => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => flushBounds(), HUD_PERSIST_DELAY_MS)
  }

  const flushBounds = () => {
    clearTimeout(persistTimer)
    persistTimer = undefined

    if (!pendingBounds) return

    try {
      writeHudState(stateFile, pendingBounds)
    } catch (error) {
      console.error("[hud] failed to persist bounds", error)
    }
  }

  const opener = () => {
    const focused = BrowserWindow.getFocusedWindow()

    if (focused && !isHudWindow(focused)) return focused

    const last = input.lastMainWindow()

    return last && !last.isDestroyed() && !isHudWindow(last) ? last : undefined
  }

  const open = (route?: string) => {
    if (state.status !== "closed" || state.disposed) return

    const restoreWindow = opener()
    // A global shortcut opens on the session the last focused main window was showing, not on
    // whichever window happened to report a route last.
    const target = route ?? (restoreWindow ? routes.get(restoreWindow.id) : undefined) ?? lastRoute

    if (!target) {
      focusMain()

      return
    }

    // The hidden main window keeps its composer and timeline in memory; full-speed timers let the
    // HUD's composer sync land before the window is shown again.
    restoreWindow?.webContents.setBackgroundThrottling(false)
    restoreWindow?.hide()
    dispatch({ type: "open.requested", route: target, restoreWindowID: restoreWindow?.id })
  }

  const close = () => dispatch({ type: "close.requested" })

  const toggle = (route?: string) => {
    if (state.status === "open" || state.status === "opening" || state.status === "closing") {
      close()

      return
    }

    open(route)
  }

  const setBounds = (bounds: HudBounds) => {
    if (!win || win.isDestroyed()) return resolveOpenBounds()

    return applyBounds(bounds)
  }

  const resize = (input: { start: HudBounds; edge: HudEdge; delta: { x: number; y: number } }) => {
    if (!win || win.isDestroyed()) return resolveOpenBounds()

    return applyBounds(applyHudResize({ ...input, area: areaFor(input.start) }))
  }

  const resetLayout = () => {
    const target = win && !win.isDestroyed() ? win.getBounds() : resolveOpenBounds()

    return applyBounds(defaultHudBounds(screen.getDisplayMatching(target).workArea))
  }

  const snapToPointer = () => {
    if (!win || win.isDestroyed()) return resolveOpenBounds()

    const point = screen.getCursorScreenPoint()
    const area = screen.getDisplayNearestPoint(point).workArea
    const current = win.getBounds()

    return applyBounds(snapHudBounds(point, { width: current.width, height: current.height }, area))
  }

  return {
    toggle,
    open,
    close,
    setBounds,
    resize,
    resetLayout,
    snapToPointer,
    reportRoute(windowID, route) {
      lastRoute = route

      if (route) routes.set(windowID, route)
      else routes.delete(windowID)
    },
    captureContext(screenshot) {
      if (!win || win.isDestroyed()) return Promise.resolve({ note: "", platform: process.platform })

      return captureHudContext(win.getBounds(), screenshot)
    },
    windowing() {
      return resolveHudWindowing()
    },
    setWorkspaceTransfer(enabled) {
      const current = win
      const windowing = resolveHudWindowing()

      if (!current || current.isDestroyed() || !windowing.workspaceTransfer) return

      try {
        current.setVisibleOnAllWorkspaces(Boolean(enabled))
      } catch {
        // Workspace APIs are window-manager capabilities.
      }
    },
    setIgnoreMouse(ignore) {
      const current = win
      const windowing = resolveHudWindowing()

      if (!current || current.isDestroyed()) return

      // X11 cannot restore an input region after ignoring; Wayland has no
      // forwarded moves. Only the platforms Hermes uses keep the per-element path.
      if (ignore && !windowing.clickThrough) return

      try {
        current.setIgnoreMouseEvents(Boolean(ignore), { forward: true })
      } catch {
        // Not every compositor implements it.
      }
    },
    setFrost(enabled) {
      const current = win

      if (!current || current.isDestroyed() || process.platform !== "darwin") return

      try {
        // The native material is the whole window rectangle. Only show it while
        // the band/composer are up; an idle HUD must not be a frosted slab.
        current.setVibrancy(enabled ? "under-window" : null)
      } catch {
        // Vibrancy is an AppKit capability.
      }
    },
    state() {
      const bounds = win && !win.isDestroyed() ? win.getBounds() : undefined

      return { open: !!win, bounds }
    },
    dispose() {
      clearTimeout(closeTimer)
      closeTimer = undefined
      clearTimeout(persistTimer)
      flushBounds()
      dispatch({ type: "disposed" })

      if (win && !win.isDestroyed()) win.destroy()

      win = undefined
    },
  }
}
