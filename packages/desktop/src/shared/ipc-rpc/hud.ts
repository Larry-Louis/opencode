import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

const Bounds = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})

export type Bounds = Schema.Schema.Type<typeof Bounds>

const Edge = Schema.Literals(["n", "s", "e", "w", "ne", "nw", "se", "sw"])

export type Edge = Schema.Schema.Type<typeof Edge>

const HudImage = Schema.Struct({
  dataUrl: Schema.String,
  mime: Schema.String,
  name: Schema.String,
})

export type HudImage = Schema.Schema.Type<typeof HudImage>

export const HudCapture = Schema.Struct({
  note: Schema.String,
  image: Schema.optional(HudImage),
})

export type HudCapture = Schema.Schema.Type<typeof HudCapture>

/** The same shape the app router already accepts for a session route. */
export const HudRoute = Schema.String.check(
  Schema.isPattern(/^\/server\/[^/]+\/session\/[^/]+$/u),
  Schema.isMaxLength(2_048),
)

export const HudOpen = Rpc.make("HudOpen", {
  payload: { route: HudRoute },
})

export const HudClose = Rpc.make("HudClose")

export const HudToggle = Rpc.make("HudToggle", {
  payload: { route: Schema.optional(HudRoute) },
})

export const HudSetBounds = Rpc.make("HudSetBounds", {
  payload: { bounds: Bounds },
  success: Bounds,
})

/** A resize gesture sends its start and total delta; main owns the clamping and anchoring. */
export const HudResize = Rpc.make("HudResize", {
  payload: {
    start: Bounds,
    edge: Edge,
    delta: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
  },
  success: Bounds,
})

export const HudResetLayout = Rpc.make("HudResetLayout", { success: Bounds })

export const HudSnapToPointer = Rpc.make("HudSnapToPointer", { success: Bounds })

/** A normal window reports its current session so the global shortcut has a target. */
export const HudReportSession = Rpc.make("HudReportSession", {
  payload: { route: Schema.optional(HudRoute) },
})

export const HudGetState = Rpc.make("HudGetState", {
  success: Schema.Struct({ open: Schema.Boolean, bounds: Schema.optional(Bounds) }),
})

/** Captures the display under the HUD for the next message's context. */
export const HudCaptureContext = Rpc.make("HudCaptureContext", { success: HudCapture })

export const HudRpcs = RpcGroup.make(
  HudOpen,
  HudClose,
  HudToggle,
  HudSetBounds,
  HudResize,
  HudResetLayout,
  HudSnapToPointer,
  HudReportSession,
  HudGetState,
  HudCaptureContext,
)
