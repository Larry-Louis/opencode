import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { HudRoute } from "./hud"

describe("HUD route", () => {
  test("accepts the session routes the app router uses", () => {
    expect(Schema.decodeUnknownSync(HudRoute)("/server/c2lkZWNhcg/session/ses_123")).toBe(
      "/server/c2lkZWNhcg/session/ses_123",
    )
  })

  test("rejects arbitrary URLs and paths", () => {
    for (const value of ["https://example.com", "/settings", "/server/x", "/server/x/session/y/z", ""])
      expect(() => Schema.decodeUnknownSync(HudRoute)(value)).toThrow()
  })
})
