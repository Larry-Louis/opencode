import { describe, expect, test } from "bun:test"
import { windowBootstrapArgument, windowBootstrapFromArguments, type WindowBootstrap } from "./window-bootstrap"

describe("window bootstrap", () => {
  test("round-trips through argv and keeps unknown values absent", () => {
    const bootstrap = { id: "win a/b ü", firstLaunchPending: false, packaged: true }
    expect(windowBootstrapFromArguments(["electron", windowBootstrapArgument(bootstrap)])).toEqual(bootstrap)
    // Absent means "ask over IPC", so a value must not appear on the way through.
    expect(windowBootstrapFromArguments([windowBootstrapArgument({ id: "x" })])).toEqual({ id: "x" })
    expect(() => windowBootstrapFromArguments(["electron"])).toThrow("Window bootstrap argument not found")
  })

  test("round-trips the HUD kind and its initial route", () => {
    const bootstrap: WindowBootstrap = {
      id: "hud-1",
      kind: "hud",
      firstLaunchPending: false,
      packaged: true,
      initialRoute: "/server/c2lkZWNhcg/session/ses_123",
    }

    expect(windowBootstrapFromArguments(["electron", windowBootstrapArgument(bootstrap)])).toEqual(bootstrap)
  })
})
