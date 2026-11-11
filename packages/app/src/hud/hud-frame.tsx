import { For, Show, createSignal, onCleanup, onMount, type ParentProps } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform, type HudBounds, type HudEdge } from "@/runtime/platform/platform"
import { HudModeProvider } from "./hud-context"
import { HUD_NOTE, readIncludeScreen, setHudContext, writeIncludeScreen } from "./hud-attachment"
import "./hud.css"

const RESIZE_EDGES: HudEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"]

/**
 * The floating bar's chrome: a drag strip, reset/close controls, the real session view and eight
 * resize handles. Geometry lives in main; this component only measures pointer travel and asks for
 * the resulting bounds, so a clamped or DPI-scaled move never drifts from the window.
 */
export function HudFrame(props: ParentProps) {
  const platform = usePlatform()
  const language = useLanguage()
  const api = platform.hud
  const [dragging, setDragging] = createSignal(false)
  const [includeScreen, setIncludeScreen] = createSignal(readIncludeScreen())

  if (!api) return <>{props.children}</>

  let stopGesture: (() => void) | undefined
  let captureAttempt = 0

  onCleanup(() => stopGesture?.())

  // Keep the next prompt's context current without blocking typing. A screenshot is only taken
  // when the user opted in; the HUD note itself is always present.
  const capture = async () => {
    const attempt = ++captureAttempt

    if (!includeScreen()) {
      setHudContext({ note: HUD_NOTE })

      return
    }

    const result = await api.captureContext().catch(() => undefined)

    // A newer capture, or turning capture off while the screen was being read, wins.
    if (attempt !== captureAttempt || !includeScreen()) return

    setHudContext({
      note: result?.note ? `${HUD_NOTE} ${result.note}` : HUD_NOTE,
      image: result?.image,
    })
  }

  onMount(() => {
    void capture()

    const focus = () => void capture()
    window.addEventListener("focus", focus)
    onCleanup(() => window.removeEventListener("focus", focus))
  })

  const toggleScreen = () => {
    const next = !includeScreen()
    setIncludeScreen(next)
    writeIncludeScreen(next)
    void capture()
  }

  // A snap or reset happens in main and moves the native window without telling this renderer;
  // read the live bounds when a gesture starts rather than trusting a cache that can be stale.
  const currentBounds = async () => (await api.getState()).bounds

  const startDrag = (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()

    // SAFETY: Solid dispatches this handler from the div the listener is attached to.
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const pointerID = event.pointerId

    void currentBounds().then((start) => {
      if (!start || event.buttons === 0) return

      const origin = { x: event.screenX, y: event.screenY }
      let latest: HudBounds | undefined
      let frame = 0

      const flush = () => {
        frame = 0

        if (latest) void api.setBounds(latest)
      }

      const stop = () => {
        if (frame) cancelAnimationFrame(frame)
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", stop)
        window.removeEventListener("pointercancel", stop)
        stopGesture = undefined
        setDragging(false)
        flush()
      }

      const move = (event: PointerEvent) => {
        if (event.pointerId !== pointerID) return

        latest = {
          ...start,
          x: Math.round(start.x + event.screenX - origin.x),
          y: Math.round(start.y + event.screenY - origin.y),
        }

        if (!frame) frame = requestAnimationFrame(flush)
      }

      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", stop)
      window.addEventListener("pointercancel", stop)
      stopGesture = stop
      setDragging(true)
    })
  }

  const startResize = (edge: HudEdge) => (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()

    // SAFETY: Solid dispatches this handler from the div the listener is attached to.
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    const pointerID = event.pointerId

    void currentBounds().then((start) => {
      if (!start || event.buttons === 0) return

      const origin = { x: event.screenX, y: event.screenY }
      let delta = { x: 0, y: 0 }
      let frame = 0

      const flush = () => {
        frame = 0
        void api.resize({ start, edge, delta })
      }

      const stop = () => {
        if (frame) cancelAnimationFrame(frame)
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", stop)
        window.removeEventListener("pointercancel", stop)
        stopGesture = undefined
        setDragging(false)
        flush()
      }

      const move = (event: PointerEvent) => {
        if (event.pointerId !== pointerID) return

        delta = { x: event.screenX - origin.x, y: event.screenY - origin.y }

        if (!frame) frame = requestAnimationFrame(flush)
      }

      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", stop)
      window.addEventListener("pointercancel", stop)
      stopGesture = stop
      setDragging(true)
    })
  }

  return (
    <div data-component="hud-frame" class="relative flex size-full min-h-0 flex-col overflow-hidden rounded-[12px]">
      <div
        data-hud-drag
        class="relative z-[70] flex h-7 shrink-0 cursor-grab items-center gap-1.5 px-2 select-none active:cursor-grabbing"
        onPointerDown={startDrag}
      >
        <span class="text-[11px] font-medium tracking-wide text-v2-text-text-faint uppercase">
          {language.t("hud.label")}
        </span>
        <span class="min-w-0 flex-1" />
        <button
          type="button"
          data-hud-context
          aria-pressed={includeScreen()}
          aria-label={language.t(includeScreen() ? "hud.context.disable" : "hud.context.enable")}
          title={language.t(includeScreen() ? "hud.context.disable" : "hud.context.enable")}
          class="grid size-5 place-items-center rounded-[4px] hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          classList={{
            "text-v2-text-text-base": includeScreen(),
            "text-v2-text-text-faint hover:text-v2-text-text-base": !includeScreen(),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={toggleScreen}
        >
          <Icon name="monitor" size="small" />
        </button>
        <Show when={includeScreen()}>
          <button
            type="button"
            aria-label={language.t("hud.context.refresh")}
            title={language.t("hud.context.refresh")}
            class="grid size-5 place-items-center rounded-[4px] text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => void capture()}
          >
            <Icon name="refresh" size="small" />
          </button>
        </Show>
        <button
          type="button"
          aria-label={language.t("hud.reset")}
          title={language.t("hud.reset")}
          class="grid size-5 place-items-center rounded-[4px] text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void api.resetLayout()}
        >
          <Icon name="reset" size="small" />
        </button>
        <button
          type="button"
          aria-label={language.t("hud.close")}
          title={language.t("hud.close")}
          class="grid size-5 place-items-center rounded-[4px] text-v2-text-text-faint hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:outline-none"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void api.close()}
        >
          <Icon name="close" size="small" />
        </button>
      </div>
      <div class="relative flex min-h-0 flex-1 flex-col" data-dragging={dragging() ? "" : undefined}>
        <HudModeProvider>{props.children}</HudModeProvider>
      </div>
      <For each={RESIZE_EDGES}>
        {(edge) => <div data-hud-resize={edge} aria-hidden="true" onPointerDown={startResize(edge)} />}
      </For>
    </div>
  )
}
