import { describe, expect, test } from "bun:test"
import { pickWindowBelow, type WindowInfo } from "./window-below"

const window = (app: string, title: string, x: number, y: number, width = 800, height = 600, pid = 10): WindowInfo => ({
  app,
  title,
  bounds: { x, y, width, height },
  id: x,
  pid,
})

describe("window below", () => {
  test("walks past our own windows and takes the first overlapping one", () => {
    const self = window("OpenCode", "OpenCode HUD", 500, 500, 620, 320, 1)
    const editor = window("Editor", "main.ts", 100, 100, 800, 600, 3)
    const browser = window("Browser", "Docs", 0, 0, 1920, 1080, 2)

    const picked = pickWindowBelow([self, editor, browser], 1, "OpenCode HUD")

    expect(picked.below?.app).toBe("Editor")
    expect(picked.frontmost).toEqual({ app: "Editor", title: "main.ts" })
  })

  test("skips a non-overlapping window in the z-order", () => {
    const self = window("OpenCode", "OpenCode HUD", 500, 500, 620, 320, 1)
    const beside = window("Finder", "Files", 0, 0, 100, 100, 2)
    const under = window("Editor", "main.ts", 500, 500, 800, 600, 3)

    expect(pickWindowBelow([self, beside, under], 1, "OpenCode HUD").below?.app).toBe("Editor")
  })

  test("without a self marker, the first other window is still the answer", () => {
    const first = window("Browser", "Docs", 0, 0, 1920, 1080, 2)
    const second = window("Editor", "main.ts", 100, 100, 800, 600, 3)

    const picked = pickWindowBelow([first, second], 1, "OpenCode HUD")

    expect(picked.below?.app).toBe("Browser")
    expect(picked.frontmost?.app).toBe("Browser")
  })
})
