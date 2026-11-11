import { beforeEach, describe, expect, test } from "bun:test"
import {
  HUD_NOTE,
  readHudContext,
  readIncludeScreen,
  setHudContext,
  withHudNote,
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

  test("the base note tells the model the bar is the context", () => {
    expect(HUD_NOTE).toContain("floating HUD")
    expect(HUD_NOTE).toContain("this")
  })
})
