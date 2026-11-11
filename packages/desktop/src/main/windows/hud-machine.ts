/**
 * The HUD's phases in the main process. One HUD exists at a time; its state is the single source
 * of truth for "is it opening, open, closing, or gone", and every result carries the attempt that
 * asked for it so a stale create or close cannot act on a newer one.
 *
 * The transition is pure: it returns the effects the controller performs at the edge (create,
 * close, restore). Creating a BrowserWindow is synchronous, so `opening` normally lasts for a
 * single transition; it still exists because a failed create and a close racing a create are real
 * outcomes that need a home.
 */

export type HudState =
  | { readonly status: "closed"; readonly attempt: number; readonly route?: string; readonly disposed?: boolean }
  | { readonly status: "opening"; readonly attempt: number; readonly route: string; readonly restoreWindowID?: number }
  | { readonly status: "open"; readonly attempt: number; readonly route: string; readonly restoreWindowID?: number }
  | {
      readonly status: "closing"
      readonly attempt: number
      readonly route: string
      readonly restoreWindowID?: number
    }

export type HudEvent =
  | { readonly type: "toggle.requested"; readonly route?: string; readonly restoreWindowID?: number }
  | { readonly type: "open.requested"; readonly route?: string; readonly restoreWindowID?: number }
  | { readonly type: "window.created"; readonly attempt: number }
  | { readonly type: "window.failed"; readonly attempt: number }
  | { readonly type: "close.requested" }
  | { readonly type: "window.closed"; readonly attempt: number }
  | { readonly type: "disposed" }

export type HudEffect =
  | { readonly type: "create-window"; readonly attempt: number; readonly route: string }
  | { readonly type: "close-window"; readonly attempt: number }
  | { readonly type: "restore-window"; readonly windowID?: number }
  | { readonly type: "focus-main" }

export type HudTransition = {
  readonly state: HudState
  readonly effects: readonly HudEffect[]
}

const unchanged = (state: HudState): HudTransition => ({ state, effects: [] })

function start(state: HudState, route: string | undefined, restoreWindowID: number | undefined): HudTransition {
  // A disposed controller belongs to a quitting app; nothing may open after it.
  if (state.status === "closed" && state.disposed) return unchanged(state)

  const target = route ?? state.route

  // A global shortcut with no session yet has nothing to show; focusing the app is the useful result.
  if (!target) return { state, effects: [{ type: "focus-main" }] }

  return {
    state: { status: "opening", attempt: state.attempt + 1, route: target, restoreWindowID },
    effects: [{ type: "create-window", attempt: state.attempt + 1, route: target }],
  }
}

export function transitionHud(state: HudState, event: HudEvent): HudTransition {
  switch (event.type) {
    case "toggle.requested":
      if (state.status === "open" || state.status === "opening" || state.status === "closing")
        return transitionHud(state, { type: "close.requested" })

      return start(state, event.route, event.restoreWindowID)

    case "open.requested":
      if (state.status === "open") return unchanged(state)

      if (state.status === "opening") return unchanged(state)

      if (state.status === "closing") return unchanged(state)

      return start(state, event.route, event.restoreWindowID)

    case "window.created":
      if (state.status !== "opening" || state.attempt !== event.attempt) return unchanged(state)

      return {
        state: { status: "open", attempt: state.attempt, route: state.route, restoreWindowID: state.restoreWindowID },
        effects: [],
      }

    case "window.failed":
      if (state.status !== "opening" || state.attempt !== event.attempt) return unchanged(state)

      return {
        state: { status: "closed", attempt: state.attempt, route: state.route },
        effects: [{ type: "restore-window", windowID: state.restoreWindowID }],
      }

    case "close.requested":
      if (state.status === "closed" || state.status === "closing") return unchanged(state)

      return {
        state: {
          status: "closing",
          attempt: state.attempt,
          route: state.route,
          restoreWindowID: state.restoreWindowID,
        },
        // While opening, the controller closes the window when the create returns; there is nothing
        // to close yet.
        effects: state.status === "open" ? [{ type: "close-window", attempt: state.attempt }] : [],
      }

    case "window.closed":
      if (state.status !== "open" && state.status !== "closing") return unchanged(state)

      if (state.attempt !== event.attempt) return unchanged(state)

      return {
        state: { status: "closed", attempt: state.attempt, route: state.route },
        effects: [{ type: "restore-window", windowID: state.restoreWindowID }],
      }

    case "disposed":
      return {
        state: { status: "closed", attempt: state.attempt, route: state.route, disposed: true },
        effects: [],
      }
  }
}
