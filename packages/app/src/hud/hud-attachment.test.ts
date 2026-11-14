import { beforeEach, describe, expect, test } from "bun:test"
import {
  HUD_NOTE,
  readHudContext,
  readHudLockMode,
  readIncludeScreen,
  setHudContext,
  withHudNote,
  writeHudLockMode,
  writeIncludeScreen,
} from "./hud-attachment"

describe("HUD attachment", () => {
  beforeEach(() => setHudContext(null))

  test("reads as no context until the HUD sets one", () => {
    expect(readHudContext()).toBeNull()
  })

  test("prepends the HUD note and keeps the user's words", () => {
    expect(withHudNote("note", "hello")).toBe("note\n\nhello")
    expect(withHudNote(undefined, "hello")).toBe("hello")
    expect(withHudNote("", "hello")).toBe("hello")
  })

  test("screen capture is opt-in per device", () => {
    writeIncludeScreen(false)
    expect(readIncludeScreen()).toBe(false)

    writeIncludeScreen(true)
    expect(readIncludeScreen()).toBe(true)
  })

  test("the lock mode survives a reopen", () => {
    writeHudLockMode("show")
    expect(readHudLockMode()).toBe("show")

    writeHudLockMode("hide")
    expect(readHudLockMode()).toBe("hide")

    writeHudLockMode("auto")
    expect(readHudLockMode()).toBe("auto")
  })

  test("a HUD pinned by the older boolean lock reads as shown", () => {
    localStorage.removeItem("opencode.hud.lock-mode")
    localStorage.setItem("opencode.hud.locked", "1")
    expect(readHudLockMode()).toBe("show")
  })

  test("the base note tells the model the bar is the context", () => {
    expect(HUD_NOTE).toContain("floating HUD")
    expect(HUD_NOTE).toContain("this")
  })
})
