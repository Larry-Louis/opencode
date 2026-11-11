import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Option, Schema } from "effect"
import type { HudBounds } from "../../shared/hud-geometry"

// HUD geometry uses the same small atomic JSON file convention as window-state.ts: it is read
// synchronously before the window is created, so it cannot live in the renderer database.

const HudStateFile = Schema.fromJsonString(
  Schema.Struct({
    x: Schema.optional(Schema.Int),
    y: Schema.optional(Schema.Int),
    width: Schema.optional(Schema.Int),
    height: Schema.optional(Schema.Int),
  }),
)

export type SavedHudState = Schema.Schema.Type<typeof HudStateFile>

export function hudStateFile(userData: string) {
  return path.join(userData, "hud-state.json")
}

export function readHudState(file: string): Partial<HudBounds> | undefined {
  if (!existsSync(file)) return undefined

  const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(HudStateFile)(readFileSync(file, "utf8")))

  if (!decoded) return undefined

  return {
    x: decoded.x,
    y: decoded.y,
    width: decoded.width,
    height: decoded.height,
  }
}

export function writeHudState(file: string, bounds: HudBounds) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(`${file}.tmp`, JSON.stringify(bounds))
  renameSync(`${file}.tmp`, file)
}
