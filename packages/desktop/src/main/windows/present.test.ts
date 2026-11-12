import { describe, expect, test } from "bun:test"
import { presentWindow } from "./present"

function window(state: { minimized?: boolean; visible?: boolean }) {
  const calls: string[] = []

  return {
    calls,
    isMinimized: () => state.minimized ?? false,
    isVisible: () => state.visible ?? true,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  }
}

// show() on a minimized window drops a maximized window to its normal bounds, so a window coming
// back from the taskbar must be restored, never shown.
const cases: [string, { minimized?: boolean; visible?: boolean }, string[]][] = [
  ["minimized and maximized", { minimized: true }, ["restore", "focus"]],
  ["visible and unfocused", {}, ["focus"]],
  ["hidden", { visible: false }, ["show", "focus"]],
  ["minimized and hidden", { minimized: true, visible: false }, ["restore", "show", "focus"]],
]

describe("present window", () => {
  test.each(cases)("brings a %s window to the front", (_name, state, expected) => {
    const win = window(state)

    presentWindow(win)

    expect(win.calls).toEqual(expected)
  })
})
