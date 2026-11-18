import { describe, expect, test } from "bun:test"
import {
  applyHudResize,
  clampHudBounds,
  defaultHudBounds,
  HUD_DEFAULT_HEIGHT,
  HUD_DEFAULT_WIDTH,
  HUD_MIN_HEIGHT,
  HUD_MIN_WIDTH,
  hudBoundsVisible,
  snapHudBounds,
} from "./hud-geometry"

const area = { x: 0, y: 0, width: 1920, height: 1040 }

describe("hud geometry", () => {
  test("defaults to a centered bar above the bottom of the work area", () => {
    const bounds = defaultHudBounds(area)

    expect(bounds.width).toBe(HUD_DEFAULT_WIDTH)
    expect(bounds.height).toBe(HUD_DEFAULT_HEIGHT)
    expect(bounds.x).toBe(650)
    expect(bounds.y).toBe(1040 - HUD_DEFAULT_HEIGHT - 72)
  })

  test("keeps the minimum size and a grabbable part on screen", () => {
    const bounds = clampHudBounds({ x: -1000, y: 5000, width: 10, height: 10 }, area)

    expect(bounds.width).toBe(HUD_MIN_WIDTH)
    expect(bounds.height).toBe(HUD_MIN_HEIGHT)
    expect(bounds.x).toBeLessThan(0)
    expect(bounds.y).toBeLessThanOrEqual(area.height)
  })

  test("resizing from the west anchors the east edge", () => {
    const start = { x: 600, y: 400, width: 620, height: 320 }
    const next = applyHudResize({ start, edge: "w", delta: { x: -100, y: 0 }, area })

    expect(next.x).toBe(500)
    expect(next.width).toBe(720)
    expect(next.x + next.width).toBe(start.x + start.width)
  })

  test("resizing past the minimum stops at the minimum without inverting", () => {
    const start = { x: 600, y: 400, width: 620, height: 320 }
    const next = applyHudResize({ start, edge: "w", delta: { x: 2000, y: 0 }, area })

    expect(next.width).toBe(HUD_MIN_WIDTH)
    expect(next.x + next.width).toBe(start.x + start.width)
  })

  test("corner resizing applies both axes", () => {
    const start = { x: 600, y: 400, width: 620, height: 320 }
    const next = applyHudResize({ start, edge: "se", delta: { x: 100, y: 50 }, area })

    expect(next.width).toBe(720)
    expect(next.height).toBe(370)
    expect(next.x).toBe(600)
    expect(next.y).toBe(400)
  })

  test("a bar remains visible only while enough of it intersects a display", () => {
    expect(hudBoundsVisible({ x: 0, y: 0, width: 620, height: 320 }, [area])).toBe(true)
    expect(hudBoundsVisible({ x: 1800, y: 0, width: 620, height: 320 }, [area])).toBe(true)
    expect(hudBoundsVisible({ x: 3000, y: 0, width: 620, height: 320 }, [area])).toBe(false)
  })

  test("a snap near the right edge flips to the left of the pointer", () => {
    const bounds = snapHudBounds({ x: 1900, y: 300 }, { width: 620, height: 320 }, area)

    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1900)
  })

  test("negative display origins clamp correctly", () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1040 }
    const bounds = clampHudBounds({ x: -1940, y: -40, width: 620, height: 320 }, left)

    expect(bounds.x).toBe(-1940)
    expect(bounds.y).toBe(-40)
  })
})
