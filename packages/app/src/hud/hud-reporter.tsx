import { onCleanup, onMount } from "solid-js"
import { useParams } from "@solidjs/router"
import { Hud } from "@opencode/schema/hud"
import { useServer } from "@/runtime/server/current"
import { readHudContext, subscribeHudContext, type HudContext } from "./hud-attachment"

/**
 * Pushes the HUD's last capture to the server, where the `read_window_below`
 * tool reads it. This component sits inside the Session's ServerProvider; the
 * frame that captures the data sits above it, which is why the report travels
 * through the module-level subscription rather than a Solid context.
 */
export function HudContextReporter() {
  const server = useServer()
  const params = useParams<{ id: string }>()

  const report = (value: HudContext | null) => {
    if (!value || !params.id) return

    void server.ctx.sdk.api
      .rpc(Hud.Definition)
      .report({
        sessionID: params.id,
        context: {
          note: value.note,
          image: value.image,
          window: value.window,
          frontmost: value.frontmost,
          platform: value.platform ?? "unknown",
        },
      })
      .catch(() => undefined)
  }

  onMount(() => {
    const stop = subscribeHudContext(report)
    report(readHudContext())

    onCleanup(stop)
  })

  return null
}
