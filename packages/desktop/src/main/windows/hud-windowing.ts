/**
 * The HUD's windowing capabilities, derived once per platform/Ozone backend.
 *
 * Native Wayland cannot place a top-level window itself and needs a compositor
 * drag region; X11 can place it but cannot restore a window that started
 * ignoring the mouse, so it stays solid and uses a renderer drag. macOS and
 * Windows keep the renderer drag and the eight resize edges. Callers ask this
 * profile instead of re-deriving "linux && ..." at every site.
 */
export type HudWindowingBackend = "cocoa" | "win32" | "x11" | "wayland"

export type HudWindowing = {
  readonly backend: HudWindowingBackend
  /** Client can set global x/y. Native Wayland cannot. */
  readonly clientPlacement: boolean
  /** Immediate Ctrl+primary-button grab (X11 renderer drag). */
  readonly controlDrag: boolean
  /** The compositor owns the move; the page uses an app-region drag handle. */
  readonly nativeDrag: boolean
  /** The OS window cannot punch click-through holes (Linux X11). */
  readonly solid: boolean
  /** The platform supports setIgnoreMouseEvents({ forward: true }). */
  readonly clickThrough: boolean
  /** Keep the grabbed window visible while the user changes virtual desktops. */
  readonly workspaceTransfer: boolean
}

function requestedOzonePlatform(env: NodeJS.ProcessEnv, argv: readonly string[]): string | null {
  let explicit: string | null = null
  let hint: string | null = null

  for (const arg of argv) {
    const match = /^--ozone-platform(-hint)?=(.+)$/.exec(arg)

    if (!match) continue

    if (match[1]) hint = match[2].toLowerCase()
    else explicit = match[2].toLowerCase()
  }

  return explicit ?? hint ?? env.ELECTRON_OZONE_PLATFORM_HINT?.toLowerCase() ?? null
}

function waylandSession(env: NodeJS.ProcessEnv) {
  return env.XDG_SESSION_TYPE === "wayland" || (Boolean(env.WAYLAND_DISPLAY) && !env.DISPLAY)
}

function ozoneBackend(env: NodeJS.ProcessEnv, argv: readonly string[]): "x11" | "wayland" {
  const requested = requestedOzonePlatform(env, argv)

  if (requested === "x11") return "x11"

  if (requested === "wayland") return "wayland"

  return waylandSession(env) ? "wayland" : "x11"
}

export function resolveHudWindowing(
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv,
): HudWindowing {
  if (platform === "darwin" || platform === "win32")
    return {
      backend: platform === "darwin" ? "cocoa" : "win32",
      clientPlacement: true,
      controlDrag: false,
      nativeDrag: false,
      solid: false,
      clickThrough: true,
      workspaceTransfer: false,
    }

  const backend = ozoneBackend(env, argv)

  if (backend === "wayland")
    return {
      backend,
      clientPlacement: false,
      controlDrag: false,
      nativeDrag: true,
      solid: false,
      clickThrough: false,
      workspaceTransfer: false,
    }

  return {
    backend,
    clientPlacement: true,
    controlDrag: true,
    nativeDrag: false,
    solid: true,
    clickThrough: false,
    workspaceTransfer: true,
  }
}
