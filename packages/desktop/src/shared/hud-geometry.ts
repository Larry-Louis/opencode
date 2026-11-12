export type HudBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type HudPoint = {
  x: number
  y: number
}

export type HudArea = HudBounds

export type HudEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

export const HUD_DEFAULT_WIDTH = 620

export const HUD_DEFAULT_HEIGHT = 320

export const HUD_MIN_WIDTH = 380

export const HUD_MIN_HEIGHT = 160

/** The default placement leaves room for a dock or taskbar under the bar. */
export const HUD_DEFAULT_BOTTOM_MARGIN = 72

/** How much of the bar must stay on a display for a saved or dragged position to count as visible. */
export const HUD_MIN_VISIBLE_WIDTH = 80

export const HUD_MIN_VISIBLE_HEIGHT = 40

/** The bar never takes more than this share of a display's work area. */
const HUD_MAX_AREA_RATIO = 0.9

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

/** The largest size the bar may take on a display. */
export function maxHudSize(area: HudArea) {
  return {
    width: Math.max(HUD_MIN_WIDTH, Math.floor(area.width * HUD_MAX_AREA_RATIO)),
    height: Math.max(HUD_MIN_HEIGHT, Math.floor(area.height * HUD_MAX_AREA_RATIO)),
  }
}

/** The default bar: centered above the bottom edge of the display. */
export function defaultHudBounds(area: HudArea): HudBounds {
  const maximum = maxHudSize(area)
  const width = clamp(HUD_DEFAULT_WIDTH, HUD_MIN_WIDTH, maximum.width)
  const height = clamp(HUD_DEFAULT_HEIGHT, HUD_MIN_HEIGHT, maximum.height)

  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + area.height - height - HUD_DEFAULT_BOTTOM_MARGIN),
    width,
    height,
  }
}

/**
 * Keeps a bar on screen. Unlike a normal window it may hang off an edge, but at least
 * `HUD_MIN_VISIBLE_*` of it stays grabbable. Size is capped to the display's work area.
 */
export function clampHudBounds(bounds: HudBounds, area: HudArea): HudBounds {
  const maximum = maxHudSize(area)
  const width = clamp(Math.round(finiteOr(bounds.width, HUD_DEFAULT_WIDTH)), HUD_MIN_WIDTH, maximum.width)
  const height = clamp(Math.round(finiteOr(bounds.height, HUD_DEFAULT_HEIGHT)), HUD_MIN_HEIGHT, maximum.height)
  const minX = area.x - width + HUD_MIN_VISIBLE_WIDTH
  const maxX = area.x + area.width - HUD_MIN_VISIBLE_WIDTH
  const minY = area.y - height + HUD_MIN_VISIBLE_HEIGHT
  const maxY = area.y + area.height - HUD_MIN_VISIBLE_HEIGHT

  return {
    x: Math.round(clamp(finiteOr(bounds.x, area.x), minX, maxX)),
    y: Math.round(clamp(finiteOr(bounds.y, area.y), minY, maxY)),
    width,
    height,
  }
}

/** Whether enough of the bar intersects one of the displays to remain usable. */
export function hudBoundsVisible(bounds: HudBounds, areas: readonly HudArea[]) {
  return areas.some((area) => {
    const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)

    return overlapX >= HUD_MIN_VISIBLE_WIDTH && overlapY >= HUD_MIN_VISIBLE_HEIGHT
  })
}

/**
 * Applies a pointer drag to a bar. The edge opposite a resized edge stays anchored; the minimum
 * size wins over further motion, so dragging past it cannot invert the rectangle.
 */
export function applyHudResize(input: { start: HudBounds; edge: HudEdge; delta: HudPoint; area: HudArea }): HudBounds {
  const maximum = maxHudSize(input.area)
  const { start, edge, delta } = input
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height

  if (edge.includes("w")) left = Math.min(left + delta.x, right - HUD_MIN_WIDTH)

  if (edge.includes("e")) right = Math.max(right + delta.x, left + HUD_MIN_WIDTH)

  if (edge.includes("n")) top = Math.min(top + delta.y, bottom - HUD_MIN_HEIGHT)

  if (edge.includes("s")) bottom = Math.max(bottom + delta.y, top + HUD_MIN_HEIGHT)

  // A maximum size pins the edge being dragged; the opposite edge does not move.
  if (right - left > maximum.width) {
    if (edge.includes("w")) left = right - maximum.width
    else right = left + maximum.width
  }

  if (bottom - top > maximum.height) {
    if (edge.includes("n")) top = bottom - maximum.height
    else bottom = top + maximum.height
  }

  return clampHudBounds({ x: left, y: top, width: right - left, height: bottom - top }, input.area)
}

/** Puts the bar just below-right of the cursor, flipping to the other side near an edge. */
export function snapHudBounds(point: HudPoint, size: { width: number; height: number }, area: HudArea): HudBounds {
  const maximum = maxHudSize(area)
  const width = clamp(Math.round(size.width), HUD_MIN_WIDTH, maximum.width)
  const height = clamp(Math.round(size.height), HUD_MIN_HEIGHT, maximum.height)
  const gap = 16
  const right = point.x + gap + width > area.x + area.width ? point.x - gap - width : point.x + gap
  const down = point.y + gap + height > area.y + area.height ? point.y - gap - height : point.y + gap

  return clampHudBounds({ x: Math.round(right), y: Math.round(down), width, height }, area)
}
