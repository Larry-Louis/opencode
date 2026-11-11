import { BrowserWindow } from "electron"
import { Effect } from "effect"
import { HudRpcs } from "../../shared/ipc-rpc"
import { getWindowID } from "../windows"
import { isHudWindow } from "../windows/kinds"
import { IpcPortHandoff } from "../ipc-transport"
import { ApplicationLifecycle } from "../lifecycle"
import { sender, type RpcContext } from "./context"

export const hudHandlers = HudRpcs.toLayer(
  Effect.gen(function* () {
    const handoff = yield* IpcPortHandoff
    const lifecycle = yield* ApplicationLifecycle.Service
    const caller = (context: RpcContext) => BrowserWindow.fromWebContents(sender(handoff, context))

    return HudRpcs.of({
      HudOpen: ({ route }) => Effect.sync(() => lifecycle.hud.open(route)),
      HudClose: () => Effect.sync(() => lifecycle.hud.close()),
      HudToggle: ({ route }) => Effect.sync(() => lifecycle.hud.toggle(route)),
      HudSetBounds: ({ bounds }) => Effect.sync(() => lifecycle.hud.setBounds(bounds)),
      HudResize: ({ start, edge, delta }) => Effect.sync(() => lifecycle.hud.resize({ start, edge, delta })),
      HudResetLayout: () => Effect.sync(() => lifecycle.hud.resetLayout()),
      HudSnapToPointer: () => Effect.sync(() => lifecycle.hud.snapToPointer()),
      HudReportSession: ({ route }, context) =>
        Effect.sync(() => {
          const win = caller(context)

          // Only a normal app window owns a session; the HUD reports nothing back into the target.
          if (!win || win.isDestroyed() || isHudWindow(win) || !getWindowID(win)) return

          lifecycle.hud.reportRoute(win.id, route)
        }),
      HudGetState: () => Effect.sync(() => lifecycle.hud.state()),
      HudCaptureContext: () => Effect.promise(() => lifecycle.hud.captureContext()),
    })
  }),
)
