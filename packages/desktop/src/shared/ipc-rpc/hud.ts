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

const HudWindow = Schema.Struct({
  app: Schema.String,
  title: Schema.String,
  bounds: Bounds,
  id: Schema.Number,
  pid: Schema.Number,
})

const HudCapture = Schema.Struct({
  note: Schema.String,
  image: Schema.optional(HudImage),
  window: Schema.optional(HudWindow),
  frontmost: Schema.optional(Schema.Struct({ app: Schema.String, title: Schema.String })),
  platform: Schema.String,
})

export type HudCapture = Schema.Schema.Type<typeof HudCapture>

const HudWindowing = Schema.Struct({
  backend: Schema.Literals(["cocoa", "win32", "x11", "wayland"]),
  clientPlacement: Schema.Boolean,
  controlDrag: Schema.Boolean,
  nativeDrag: Schema.Boolean,
  solid: Schema.Boolean,
  workspaceTransfer: Schema.Boolean,
})

export type HudWindowing = Schema.Schema.Type<typeof HudWindowing>

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

/** Captures the window below and, when requested, the display under the HUD. */
export const HudCaptureContext = Rpc.make("HudCaptureContext", {
  payload: { screenshot: Schema.Boolean },
  success: HudCapture,
})

/** The platform/Ozone capability profile the renderer uses for drag and resize. */
export const HudGetWindowing = Rpc.make("HudGetWindowing", { success: HudWindowing })

/** X11/KWin: keep the HUD visible while the user switches virtual desktops mid-drag. */
export const HudSetWorkspaceTransfer = Rpc.make("HudSetWorkspaceTransfer", {
  payload: { enabled: Schema.Boolean },
})

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
  HudGetWindowing,
  HudSetWorkspaceTransfer,
)
