import { For, Show, createEffect, createSignal, onCleanup, onMount, type ParentProps } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform, type HudBounds, type HudEdge, type HudWindowing } from "@/runtime/platform/platform"
import { HudModeProvider } from "./hud-context"
import { HUD_NOTE, readHudLocked, readIncludeScreen, setHudContext, writeHudLocked, writeIncludeScreen, type HudContext } from "./hud-attachment"
import "./hud.css"

const ALL_RESIZE_EDGES: HudEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"]

/** Native Wayland cannot change a top-level's origin, so only growth edges exist. */
const WAYLAND_RESIZE_EDGES: HudEdge[] = ["e", "se", "s"]

const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [role="link"], [data-hud-resize], [data-hud-drag], [data-hud-rail]'

/** Hold anywhere on the session before the bar becomes draggable. Short enough to feel like a
 *  grab, long enough that a click still clicks; movement cancels so text selection still works. */
const LONG_PRESS_MS = 140

const MOVE_TOLERANCE = 8

const defaultWindowing = (): HudWindowing => ({
  backend: "win32",
  clientPlacement: true,
  controlDrag: false,
  nativeDrag: false,
  solid: false,
  clickThrough: true,
  workspaceTransfer: false,
})

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
  const [locked, setLocked] = createSignal(readHudLocked())
  const [windowing, setWindowing] = createSignal<HudWindowing>(defaultWindowing())
  const [typing, setTyping] = createSignal(false)
  const [recent, setRecent] = createSignal(true)
  const [working, setWorking] = createSignal(false)
  const [focused, setFocused] = createSignal(typeof document === "undefined" ? false : document.hasFocus())
  let content: HTMLDivElement | undefined

  if (!api) return <>{props.children}</>

  let stopGesture: (() => void) | undefined
  let stopHold: (() => void) | undefined
  let captureAttempt = 0

  onCleanup(() => {
    stopGesture?.()
    stopHold?.()
  })

  // Keep the next prompt's context current without blocking typing. A screenshot is only taken
  // when the user opted in; the HUD note itself is always present.
  const capture = async () => {
    const attempt = ++captureAttempt

    // Window metadata is always useful and stays metadata-only. Pixels are only
    // requested while the user opted in.
    const result = await api.captureContext(includeScreen()).catch(() => undefined)

    if (attempt !== captureAttempt) return

    const note = result?.note ? `${HUD_NOTE} ${result.note}` : HUD_NOTE
    const image = includeScreen() ? result?.image : undefined
    const context: HudContext = { note, image, platform: result?.platform }

    if (result?.window) context.window = result.window

    if (result?.frontmost) context.frontmost = result.frontmost

    setHudContext(context)
  }

  onMount(() => {
    void api.windowing().then(setWindowing, () => undefined)
  })

  // Native macOS frost is the whole window rectangle; it follows the band's
  // visibility so an idle HUD is not a blurred slab.
  createEffect(() => {
    void api.setFrost(typing() || recent() || working() || locked()).catch(() => undefined)
  })
  onCleanup(() => void api.setFrost(false).catch(() => undefined))

  onMount(() => {
    void capture()

    const focus = () => void capture()

    const close = (event: KeyboardEvent) => {
      const mod = platform.os === "macos" ? event.metaKey : event.ctrlKey

      if (!mod || event.shiftKey || event.altKey || event.key.toLowerCase() !== "w") return

      event.preventDefault()
      event.stopPropagation()
      void api.close()
    }

    window.addEventListener("focus", focus)
    window.addEventListener("keydown", close, true)
    onCleanup(() => {
      window.removeEventListener("focus", focus)
      window.removeEventListener("keydown", close, true)
    })
  })

  onMount(() => {
    const root = content

    if (!root) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let frame = 0
    let wasWorking = false

    const hold = () => {
      setRecent(true)
      clearTimeout(timer)
      timer = setTimeout(() => setRecent(false), 1_100)
    }

    // Session running is rendered by the session screen as a data attribute on
    // the transcript wrapper. Keep the band up for the whole think/reply, not
    // just for the 1.1s hold that a message mutation buys.
    const syncWorking = () => {
      const next = root.querySelector('[data-hud-transcript][data-hud-transcript-working]') !== null
      setWorking(next)

      if (wasWorking && !next) hold()

      wasWorking = next
    }

    const syncTyping = () =>
      setTyping(
        document.hasFocus() &&
          document.activeElement instanceof Element &&
          document.activeElement.closest('[data-component="composer-editor"]') !== null,
      )

    const focusIn = () => {
      setFocused(true)
      syncTyping()
      hold()
    }

    const focusOut = () => queueMicrotask(syncTyping)

    const windowFocus = () => {
      setFocused(true)
      syncTyping()
      hold()
    }

    const windowBlur = () => {
      setFocused(false)
      setTyping(false)
      clearTimeout(timer)
      timer = setTimeout(() => setRecent(false), 1_100)
    }

    // Streaming mutates the transcript tens of times a second; one hold per
    // painted frame is enough to keep the band up while the answer writes.
    const observer = new MutationObserver(() => {
      syncWorking()

      if (frame) return

      frame = requestAnimationFrame(() => {
        frame = 0
        hold()
      })
    })

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-hud-transcript-working"],
      childList: true,
      subtree: true,
      characterData: true,
    })
    root.addEventListener("focusin", focusIn)
    root.addEventListener("focusout", focusOut)
    window.addEventListener("focus", windowFocus)
    window.addEventListener("blur", windowBlur)
    syncTyping()
    syncWorking()
    hold()

    onCleanup(() => {
      observer.disconnect()
      clearTimeout(timer)

      if (frame) cancelAnimationFrame(frame)

      root.removeEventListener("focusin", focusIn)
      root.removeEventListener("focusout", focusOut)
      window.removeEventListener("focus", windowFocus)
      window.removeEventListener("blur", windowBlur)
    })
  })

  onMount(() => {
    let ignored = false
    let point: { x: number; y: number } | null = null

    const apply = () => {
      const windowingState = windowing()

      // A locked HUD is a normal always-on-top window: it keeps the pointer so its
      // band and rail stay usable after focus moves to the app behind it.
      if (!windowingState.clickThrough || locked()) {
        if (ignored) {
          ignored = false
          void api.setIgnoreMouse(false)
        }

        return
      }

      // A window that has not seen the pointer yet stays solid; the first move decides.
      if (!point) return

      const hit = document.elementFromPoint(point.x, point.y)
      const frameRoot = content?.closest("[data-component='hud-frame']")

      const overlayFocused =
        document.activeElement instanceof Element &&
        document.activeElement !== document.body &&
        !!frameRoot &&
        !frameRoot.contains(document.activeElement)

      // A portaled menu or dialog is a live surface even while the pointer sits
      // between its rows. Without this the window turns click-through as the
      // pointer enters the popup and its items never receive the click.
      const popupOpen =
        document.querySelector(
          '[data-popper-positioner] [data-component="menu-v2-content"], [data-popper-positioner] [data-slot="select-v2-content"], [data-slot="dialog-content"]',
        ) !== null

      const interactive =
        popupOpen ||
        dragging() ||
        typing() ||
        (working() && focused()) ||
        overlayFocused ||
        // A visible band is a reading surface even when the pointer is between
        // controls; keep the window solid so text can be scrolled and selected.
        ((focused() || working() || locked()) &&
          hit instanceof Element &&
          hit.closest("[data-hud-transcript]") !== null) ||
        (hit instanceof Element &&
          hit.closest(
            '[data-hud-drag], [data-hud-rail], button, a[href], input, textarea, select, [role="button"], [role="link"], [data-hud-resize], [data-component="composer"], [data-component="composer-suggestions"]',
          ) !== null)

      const next = !interactive

      if (next === ignored) return

      ignored = next
      void api.setIgnoreMouse(next)
    }

    const move = (event: MouseEvent) => {
      point = { x: event.clientX, y: event.clientY }
      apply()
    }

    const lost = () => {
      point = null

      if (!windowing().clickThrough) return

      if (locked()) return

      // A focused composer keeps the window solid even as the pointer leaves;
      // that is what lets the HUD stay usable while typing.

      if (document.hasFocus() && typing()) return

      if (!ignored) {
        ignored = true
        void api.setIgnoreMouse(true)
      }
    }

    const refocus = () => {
      if (!windowing().clickThrough) return

      // Until the pointer moves again the window is solid, so a keyboard user
      // who comes back can click straight into the bar.
      if (ignored) {
        ignored = false
        void api.setIgnoreMouse(false)
      }
    }

    window.addEventListener("mousemove", move)
    window.addEventListener("blur", lost)
    window.addEventListener("focus", refocus)
    document.addEventListener("mouseleave", lost)
    createEffect(() => {
      dragging()
      typing()
      recent()
      working()
      locked()
      apply()
    })

    onCleanup(() => {
      if (ignored) void api.setIgnoreMouse(false)
      window.removeEventListener("mousemove", move)
      window.removeEventListener("blur", lost)
      window.removeEventListener("focus", refocus)
      document.removeEventListener("mouseleave", lost)
    })
  })

  const toggleScreen = () => {
    const next = !includeScreen()
    setIncludeScreen(next)
    writeIncludeScreen(next)
    void capture()
  }

  const toggleLock = () => {
    const next = !locked()
    setLocked(next)
    writeHudLocked(next)
  }

  // A snap or reset happens in main and moves the native window without telling this renderer;
  // read the live bounds when a gesture starts rather than trusting a cache that can be stale.
  const currentBounds = async () => (await api.getState()).bounds

  const pointerDrag = (pointerID: number, screenX: number, screenY: number, alive: () => boolean = () => true) => {
    void currentBounds().then((start) => {
      if (!start || !alive()) return

      const origin = { x: screenX, y: screenY }
      const transfer = windowing().workspaceTransfer
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

        if (transfer) void api.setWorkspaceTransfer(false)
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

      if (transfer) void api.setWorkspaceTransfer(true)
    })
  }

  const startStripDrag = (event: PointerEvent) => {
    if (event.button !== 0 || windowing().nativeDrag) return
    event.preventDefault()

    // SAFETY: Solid dispatches this handler from the div the listener is attached to.
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    pointerDrag(event.pointerId, event.screenX, event.screenY)
  }

  /** Press-and-hold anywhere on the session; Ctrl+primary is an immediate X11 grab. */
  const startComposerDrag = (event: PointerEvent) => {
    if (event.button !== 0 || windowing().nativeDrag) return

    const hit = event.target

    if (!(hit instanceof Element) || hit.closest(INTERACTIVE)) return

    // SAFETY: Solid dispatches this handler from the div the listener is attached to.
    const target = event.currentTarget as HTMLElement
    const pointerID = event.pointerId
    const origin = { x: event.screenX, y: event.screenY }
    let latest = origin
    let pressed = true
    let armed = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      timer = undefined
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      stopHold = undefined
    }

    const up = () => {
      pressed = false
      cleanup()
    }

    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerID) return

      latest = { x: event.screenX, y: event.screenY }

      if (
        !armed &&
        (Math.abs(latest.x - origin.x) > MOVE_TOLERANCE || Math.abs(latest.y - origin.y) > MOVE_TOLERANCE)
      )
        cleanup()
    }

    const arm = () => {
      timer = undefined

      if (!pressed) return cleanup()

      armed = true

      try {
        target.setPointerCapture(pointerID)
      } catch {
        // Window listeners still keep the gesture alive.
      }

      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()

      pointerDrag(pointerID, latest.x, latest.y, () => pressed)
    }

    if (windowing().controlDrag && event.ctrlKey) {
      event.preventDefault()
      arm()

      return
    }

    timer = setTimeout(arm, LONG_PRESS_MS)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    stopHold = cleanup
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

  const resizeEdges = () => (windowing().clientPlacement ? ALL_RESIZE_EDGES : WAYLAND_RESIZE_EDGES)

  const onContentPointerDown = (event: PointerEvent) => {
    const hit = event.target
    // SAFETY: Solid dispatches this handler from the div the listener is attached to.
    const root = event.currentTarget as HTMLElement

    // Reading the transcript is not leaving the composer. Links and controls still
    // take their click; everywhere else puts the caret back where typing goes.
    if (
      event.button === 0 &&
      hit instanceof Element &&
      !hit.closest(INTERACTIVE) &&
      !hit.closest('[data-component="composer-editor"]')
    ) {
      event.preventDefault()
      root.querySelector<HTMLElement>('[data-component="composer-editor"]')?.focus()
    }

    startComposerDrag(event)
  }

  return (
    <div
      data-component="hud-frame"
      data-hud-grabbing={dragging() ? "" : undefined}
      data-hud-recent={recent() ? "" : undefined}
      data-hud-typing={typing() ? "" : undefined}
      data-hud-working={working() ? "" : undefined}
      data-hud-focused={focused() ? "" : undefined}
      data-hud-locked={locked() ? "" : undefined}
      data-hud-clickthrough={windowing().clickThrough ? "" : undefined}
      class="relative flex size-full min-h-0 flex-col overflow-hidden rounded-[12px]"
    >
      <div
        data-hud-drag
        data-hud-native-drag={windowing().nativeDrag ? "" : undefined}
        class="relative z-[70] flex h-7 shrink-0 cursor-grab items-center gap-1.5 px-2 select-none active:cursor-grabbing"
        onPointerDown={startStripDrag}
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
          aria-label={language.t(locked() ? "hud.unlock" : "hud.lock")}
          title={language.t(locked() ? "hud.unlock" : "hud.lock")}
          aria-pressed={locked()}
          class="grid size-5 place-items-center rounded-[4px] hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          classList={{
            "text-v2-text-text-accent hover:text-v2-text-text-accent-hover": locked(),
            "text-v2-text-text-faint hover:text-v2-text-text-base": !locked(),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={toggleLock}
        >
          <Icon name="lock" size="small" />
        </button>
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
      <div
        ref={content}
        class="relative flex min-h-0 flex-1 flex-row gap-1.5 px-2 pb-2"
        data-hud-native-drag={windowing().nativeDrag ? "" : undefined}
        onPointerDown={onContentPointerDown}
      >
        <HudModeProvider>{props.children}</HudModeProvider>
      </div>
      <For each={resizeEdges()}>
        {(edge) => <div data-hud-resize={edge} aria-hidden="true" onPointerDown={startResize(edge)} />}
      </For>
    </div>
  )
}
