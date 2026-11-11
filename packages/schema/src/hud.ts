export * as Hud from "./hud.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"
import { optional } from "./schema.js"

const Bounds = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
})

export const Window = Schema.Struct({
  app: Schema.String,
  title: Schema.String,
  bounds: Bounds,
  id: Schema.Number,
  pid: Schema.Number,
}).annotate({ identifier: "Hud.Window" })
export type Window = Schema.Schema.Type<typeof Window>

export const Image = Schema.Struct({
  dataUrl: Schema.String,
  mime: Schema.String,
  name: Schema.String,
}).annotate({ identifier: "Hud.Image" })
export type Image = Schema.Schema.Type<typeof Image>

/**
 * The context the desktop HUD last captured for a Session. Only metadata is
 * mandatory; pixels exist only when the user enabled screen sharing, and the
 * window itself is unavailable on compositors that withhold window identity.
 */
export const Context = Schema.Struct({
  note: Schema.String,
  image: optional(Image),
  window: optional(Window),
  frontmost: optional(Schema.Struct({ app: Schema.String, title: Schema.String })),
  platform: Schema.String,
}).annotate({ identifier: "Hud.Context" })
export type Context = Schema.Schema.Type<typeof Context>

/**
 * Desktop → server context push. The desktop HUD owns the capture (Electron main
 * reads the OS), so it reports the last context for a Session; the tool reads
 * that store. A server cannot ask the desktop for a fresh capture on its own —
 * the renderer always initiates the transport.
 */
export const Definition = Rpc.define({
  id: "opencode.hud",
  methods: {
    report: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ sessionID: Schema.String, context: Context })),
      output: Schema.toStandardSchemaV1(Schema.Null),
    },
  },
  events: {},
})
