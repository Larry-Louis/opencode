import { describe, expect, test } from "bun:test"
import { transitionHud, type HudState } from "./hud-machine"

const route = "/server/c2lkZWNhcg/session/ses_123"

describe("hud machine", () => {
  test("opens from closed and announces the window it asked for", () => {
    const start: HudState = { status: "closed", attempt: 2 }
    const next = transitionHud(start, { type: "open.requested", route, restoreWindowID: 7 })

    expect(next.state).toEqual({ status: "opening", attempt: 3, route, restoreWindowID: 7 })
    expect(next.effects).toEqual([{ type: "create-window", attempt: 3, route }])
  })

  test("a toggle with no route and no remembered route focuses the app instead of opening", () => {
    const next = transitionHud({ status: "closed", attempt: 0 }, { type: "toggle.requested" })

    expect(next.state).toEqual({ status: "closed", attempt: 0 })
    expect(next.effects).toEqual([{ type: "focus-main" }])
  })

  test("a toggle while open closes, and the close restores its window", () => {
    const open: HudState = { status: "open", attempt: 1, route, restoreWindowID: 4 }
    const closing = transitionHud(open, { type: "toggle.requested" })

    expect(closing.state).toEqual({ status: "closing", attempt: 1, route, restoreWindowID: 4 })
    expect(closing.effects).toEqual([{ type: "close-window", attempt: 1 }])

    const closed = transitionHud(closing.state, { type: "window.closed", attempt: 1 })

    expect(closed.state).toEqual({ status: "closed", attempt: 1, route })
    expect(closed.effects).toEqual([{ type: "restore-window", windowID: 4 }])
  })

  test("a stale window event cannot act on a newer attempt", () => {
    const opening: HudState = { status: "opening", attempt: 5, route }
    const next = transitionHud(opening, { type: "window.created", attempt: 4 })

    expect(next).toEqual({ state: opening, effects: [] })
  })

  test("a close that races the create keeps the machine closing and closes the created window", () => {
    const opening: HudState = { status: "opening", attempt: 1, route, restoreWindowID: 2 }
    const closing = transitionHud(opening, { type: "close.requested" })

    // The create effect is already in flight; the controller notices the phase and closes the
    // created window.
    expect(closing.state.status).toBe("closing")
    expect(closing.effects).toEqual([])
    expect(transitionHud(closing.state, { type: "window.created", attempt: 1 })).toEqual({
      state: closing.state,
      effects: [],
    })
  })

  test("a failed create restores the window it hid", () => {
    const opening: HudState = { status: "opening", attempt: 1, route, restoreWindowID: 9 }
    const next = transitionHud(opening, { type: "window.failed", attempt: 1 })

    expect(next.state).toEqual({ status: "closed", attempt: 1, route })
    expect(next.effects).toEqual([{ type: "restore-window", windowID: 9 }])
  })

  test("dispose suppresses restore and refuses to open again", () => {
    const open: HudState = { status: "open", attempt: 1, route, restoreWindowID: 3 }
    const disposed = transitionHud(open, { type: "disposed" })

    expect(disposed.state).toMatchObject({ status: "closed", disposed: true })
    expect(disposed.effects).toEqual([])
    expect(transitionHud(disposed.state, { type: "toggle.requested", route })).toEqual({
      state: disposed.state,
      effects: [],
    })
  })
})
