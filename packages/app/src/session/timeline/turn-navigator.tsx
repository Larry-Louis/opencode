import { createEffect, createMemo, createSignal, For, onCleanup, Show, type Accessor } from "solid-js"
import { Portal } from "solid-js/web"
import { useLanguage } from "@/runtime/i18n/language"
import "./turn-navigator.css"

export type TurnNavigatorItem = {
  id: string
  prompt: string
  reply?: string
  createdAt: number
}

/** Past this many turns one dot per turn stops working, so the rail shows a bar per ten turns instead. */
const DOTS_LIMIT = 20

const GROUP_SIZE = 10

type Entry = { kind: "dot" | "bar"; items: readonly TurnNavigatorItem[] }

/** A dot per user turn along the left edge of the transcript, with a preview and a jump target. */
export function TurnNavigator(props: {
  items: readonly TurnNavigatorItem[]
  scroller: Accessor<HTMLDivElement | undefined>
  bottomInset: number
  onSelect: (id: string) => void
}) {
  const language = useLanguage()
  const [activeID, setActiveID] = createSignal<string>()

  const [hovered, setHovered] = createSignal<{
    index: number
    x: number
    y: number
    side: "left" | "right"
  }>()

  let frame: number | undefined
  let closeTimer: number | undefined

  const entries = createMemo<Entry[]>(() => {
    // Only the turns past the newest twenty collapse, ten per bar; everything newer stays one dot per turn.
    const older = Math.max(0, props.items.length - DOTS_LIMIT)
    const entries: Entry[] = []

    for (let index = 0; index < older; index += GROUP_SIZE)
      entries.push({ kind: "bar", items: props.items.slice(index, Math.min(index + GROUP_SIZE, older)) })

    for (let index = older; index < props.items.length; index++)
      entries.push({ kind: "dot", items: [props.items[index]!] })

    return entries
  })

  // The turn under the reading line, matching how the transcript picks the prompt shown in the header. Rows share
  // their turn's id and sit in visual order, so the last row starting above the line is the turn being read.
  const measure = () => {
    frame = undefined
    const root = props.scroller()

    if (!root) return
    const box = root.getBoundingClientRect()
    // The reader is at the turn that fills the bottom of the reading area, so that turn is the one the rail marks.
    // The composer covers the end of the scrollport, so the reading area stops where the composer begins.
    const line = box.bottom - props.bottomInset - 1
    let active: string | undefined

    for (const element of root.querySelectorAll<HTMLElement>("[data-message-id]")) {
      const id = element.dataset.messageId

      if (!id) continue

      if (element.getBoundingClientRect().top > line) break
      active = id
    }

    if (!active) active = root.querySelector<HTMLElement>("[data-message-id]")?.dataset.messageId

    setActiveID(active && props.items.some((item) => item.id === active) ? active : undefined)
  }

  const schedule = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(measure)
  }

  createEffect(() => {
    const root = props.scroller()

    if (!root) return
    const resize = new ResizeObserver(schedule)
    resize.observe(root)
    // Scroll events do not bubble, and the transcript may scroll a viewport inside the element this component is given,
    // so listen in the capture phase.
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
    schedule()

    onCleanup(() => {
      document.removeEventListener("scroll", schedule, { capture: true })
      resize.disconnect()
    })
  })

  createEffect(() => {
    props.items.length
    schedule()
  })

  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)

    if (closeTimer !== undefined) window.clearTimeout(closeTimer)
  })

  // The preview stays open while the pointer is inside it, so a bar's turn list is clickable.
  const open = (index: number, element: HTMLElement) => {
    if (closeTimer !== undefined) window.clearTimeout(closeTimer)
    const rect = element.getBoundingClientRect()
    const rtl = language.direction() === "rtl"

    setHovered({
      index,
      x: rtl ? rect.left - 10 : rect.right + 10,
      y: rect.top + rect.height / 2,
      side: rtl ? "left" : "right",
    })
  }

  const close = () => {
    if (closeTimer !== undefined) window.clearTimeout(closeTimer)
    closeTimer = window.setTimeout(() => setHovered(undefined), 160)
  }

  const held = () => {
    if (closeTimer !== undefined) window.clearTimeout(closeTimer)
  }

  const current = createMemo(() => {
    const hover = hovered()

    if (!hover) return
    const entry = entries()[hover.index]

    return entry ? { ...hover, entry } : undefined
  })

  const active = (entry: Entry) => !!activeID() && entry.items.some((item) => item.id === activeID())

  const clock = (createdAt: number) =>
    new Intl.DateTimeFormat(language.intl(), { hour: "numeric", minute: "2-digit" }).format(new Date(createdAt))

  const time = (createdAt: number) => {
    const date = new Date(createdAt)

    if (date.toDateString() === new Date().toDateString()) return clock(createdAt)

    return `${new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(date)}, ${clock(createdAt)}`
  }

  const start = (entry: Entry) => props.items.indexOf(entry.items[0]!)

  const label = (entry: Entry, index: number) => {
    if (entry.kind === "dot") return `${index + 1} / ${props.items.length}: ${entry.items[0]!.prompt.slice(0, 120)}`

    const first = start(entry)

    return `${first + 1}–${first + entry.items.length} / ${props.items.length}: ${entry.items[0]!.prompt.slice(0, 80)}`
  }

  return (
    <>
      <div
        data-component="turn-navigator"
        style={{ "--turn-navigator-gutter": `${Math.max(56, props.bottomInset + 20)}px` }}
      >
        <div data-slot="turn-navigator-scroll" onPointerLeave={close} onScroll={() => setHovered(undefined)}>
          <ul data-slot="turn-navigator-list" data-kind={entries()[0]?.kind ?? "dot"} role="list">
            <For each={entries()}>
              {(entry, index) => (
                <li data-slot="turn-navigator-item" data-kind={entry.kind} data-active={active(entry) || undefined}>
                  <button
                    type="button"
                    data-slot="turn-navigator-dot"
                    aria-current={active(entry) ? "location" : undefined}
                    aria-label={label(entry, index())}
                    onClick={() => {
                      setHovered(undefined)
                      props.onSelect(entry.items[0]!.id)
                    }}
                    onPointerEnter={(event) => open(index(), event.currentTarget)}
                    onFocus={(event) => open(index(), event.currentTarget)}
                    onBlur={close}
                  >
                    <span aria-hidden="true" />
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </div>
      <Portal>
        <Show when={current()}>
          {(hover) => (
            <div
              data-component="turn-navigator-preview"
              data-kind={hover().entry.kind}
              data-side={hover().side}
              style={{ "--turn-preview-x": `${hover().x}px`, "--turn-preview-y": `${hover().y}px` }}
              aria-hidden="true"
              onPointerEnter={held}
              onPointerLeave={close}
            >
              <Show
                when={hover().entry.kind === "bar"}
                fallback={
                  <>
                    <div data-slot="turn-navigator-prompt">{hover().entry.items[0]!.prompt}</div>
                    <Show when={hover().entry.items[0]!.reply}>
                      <div data-slot="turn-navigator-reply">{hover().entry.items[0]!.reply}</div>
                    </Show>
                    <div data-slot="turn-navigator-meta">
                      <span>
                        {props.items.indexOf(hover().entry.items[0]!) + 1} / {props.items.length}
                      </span>
                      <time>{time(hover().entry.items[0]!.createdAt)}</time>
                    </div>
                  </>
                }
              >
                <div data-slot="turn-navigator-range">
                  <span>
                    {start(hover().entry) + 1}–{start(hover().entry) + hover().entry.items.length} /{" "}
                    {props.items.length}
                  </span>
                  <time>{time(hover().entry.items[0]!.createdAt)}</time>
                </div>
                <ul data-slot="turn-navigator-turns">
                  <For each={hover().entry.items}>
                    {(item) => (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setHovered(undefined)
                            props.onSelect(item.id)
                          }}
                        >
                          <time>{clock(item.createdAt)}</time>
                          <span>{item.prompt}</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          )}
        </Show>
      </Portal>
    </>
  )
}
