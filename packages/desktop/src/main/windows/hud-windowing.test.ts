import { describe, expect, test } from "bun:test"
import { resolveHudWindowing } from "./hud-windowing"

describe("HUD windowing", () => {
  test("macOS and Windows keep client placement and renderer dragging", () => {
    for (const platform of ["darwin", "win32"]) {
      const windowing = resolveHudWindowing(platform, {}, [])
      expect(windowing.clientPlacement).toBe(true)
      expect(windowing.nativeDrag).toBe(false)
      expect(windowing.controlDrag).toBe(false)
      expect(windowing.workspaceTransfer).toBe(false)
    }
  })

  test("X11 can place and moves from the renderer with Ctrl-drag", () => {
    const windowing = resolveHudWindowing("linux", { DISPLAY: ":0" }, [])
    expect(windowing.backend).toBe("x11")
    expect(windowing.clientPlacement).toBe(true)
    expect(windowing.controlDrag).toBe(true)
    expect(windowing.workspaceTransfer).toBe(true)
    expect(windowing.solid).toBe(true)
  })

  test("native Wayland moves from a compositor drag region and only grows from the origin edges", () => {
    const windowing = resolveHudWindowing("linux", { WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":0" }, [])
    expect(windowing.backend).toBe("x11")

    const native = resolveHudWindowing(
      "linux",
      { WAYLAND_DISPLAY: "wayland-1", XDG_SESSION_TYPE: "wayland" },
      [],
    )
    expect(native.backend).toBe("wayland")
    expect(native.nativeDrag).toBe(true)
    expect(native.clientPlacement).toBe(false)
  })

  test("an explicit Ozone hint wins over the session", () => {
    expect(resolveHudWindowing("linux", { WAYLAND_DISPLAY: "wayland-1" }, ["--ozone-platform=x11"]).backend).toBe("x11")
    expect(resolveHudWindowing("linux", { DISPLAY: ":0" }, ["--ozone-platform-hint=wayland"]).backend).toBe("wayland")
  })
})
