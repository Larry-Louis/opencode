/// <reference path="./env.d.ts" />

// Load the complete preload contract before App's optional browser bridge declaration.
import {
  AppBaseProviders,
  AppInterface,
  currentRoute,
  PlatformProvider,
  preloadRoute,
  ServerConnection,
  sessionHref,
  useCommand,
  useCurrentRoute,
  usePluginServers,
  useTabs,
  type LayoutRoute,
  type Platform,
} from "@opencode/app/desktop"
import { useTheme } from "@opencode/ui/theme/context"
import type { BaseRouterProps } from "@solidjs/router"
import { createEffect, createMemo, createSignal, lazy, onCleanup, Show, Suspense, untrack } from "solid-js"
import type { ElectronAPI } from "./api-types"
import { DesktopFirstLaunchOnboarding } from "./onboarding"
import { createDesktopPlatform } from "./platform"
import { bindDesktopMenu } from "./platform/menu"
import { createSidecarResolver, localServerStartupError, sidecarHttp } from "./startup/initialization"
import { preloadStoredLocale } from "./startup/locale"
import {
  createStartupState,
  selectDrawingPaused,
  selectFirstLaunch,
  selectFirstLaunchSplash,
  selectInterfaceMounted,
  selectOverlayFading,
  selectOverlayMounted,
  selectSidecar,
  selectSplashDeep,
  selectStartupFailure,
  selectStartupLocale,
  transitionStartup,
  type StartupEffect,
  type StartupEvent,
} from "./startup/machine"
import { LoadingSplash } from "./startup/splash"
import { getLastActiveUrl } from "./window/route-storage"
import { DesktopMemoryRouter } from "./window/router"

const offline = { url: "http://127.0.0.1:0" }

const MigrationStatus = lazy(() => import("./migration-status").then((module) => ({ default: module.MigrationStatus })))

export function DesktopApp(props: { api: ElectronAPI; version: string }) {
  const bootstrap = props.api.getWindowBootstrap()
  const hud = bootstrap.kind === "hud"
  const windowState = { id: props.api.getWindowID(), version: props.version }
  // The HUD is opened for one session and never restores a remembered route; its target arrives
  // with the bootstrap, before the renderer boots.
  const initialUrl = hud ? (bootstrap.initialRoute ?? "/") : getLastActiveUrl(windowState.id)
  const url = new URL(initialUrl, "http://localhost")
  const platform = createDesktopPlatform(props.api, windowState)

  if (hud) {
    document.documentElement.dataset.hud = ""
    document.documentElement.style.removeProperty("background-color")
  }

  const startup = createStartupDriver({
    api: props.api,
    platform,
    initialUrl,
    route: currentRoute(url.pathname, url.search),
    // The window was created with the answers the shell gate needs; only a fresh install, which has no
    // onboarding decision yet, asks over IPC and waits for the port.
    firstLaunch: hud ? false : bootstrap.firstLaunchPending,
  })

  const router = (routerProps: BaseRouterProps) => (
    <DesktopMemoryRouter {...routerProps} windowID={windowState.id} initialUrl={initialUrl} />
  )

  function DesktopShell() {
    const pluginServers = usePluginServers()

    createEffect(() => {
      if (pluginServers.ready()) startup.dispatch({ type: "plugin-servers.ready" })
    })

    // The shell only unmounts before the window when the error boundary above it catches an error.
    onCleanup(() => startup.dispatch({ type: "boundary.tripped" }))

    const activeSidecar = createMemo(
      () => {
        const data = selectSidecar(startup.state())

        return data ? sidecarHttp(data) : undefined
      },
      undefined,
      { equals: (a, b) => a?.url === b?.url },
    )

    // One connection for the window's lifetime: the server SDK follows its `http` to a new origin in place.
    const sidecarServer: ServerConnection.Sidecar = {
      type: "sidecar",
      variant: "base",
      get http() {
        return activeSidecar() ?? offline
      },
      reconnect: createSidecarResolver({
        api: props.api,
        current: () => selectSidecar(startup.state()),
        update: (data) => startup.dispatch({ type: "sidecar.changed", data }),
      }),
    }

    const servers = createMemo((): ServerConnection.Any[] => [
      ...(activeSidecar() ? [sidecarServer] : []),
      ...pluginServers.list(),
    ])

    return (
      <>
        <Show when={selectStartupFailure(startup.state())} keyed>
          {(failure) => {
            throw failure.error
          }}
        </Show>
        <Show when={selectInterfaceMounted(startup.state())}>
          <AppInterface servers={servers()} router={router} hud={hud}>
            <DesktopStartupReady dispatch={startup.dispatch} api={props.api} />
            <Show when={!hud}>
              <DesktopFirstLaunchOnboarding
                api={props.api}
                initialUrl={initialUrl}
                pending={selectFirstLaunch(startup.state())}
                dispatch={startup.dispatch}
              />
            </Show>
            <DesktopEffects api={props.api} hud={hud} />
            <Suspense fallback={null}>
              <Show when={!hud && activeSidecar()} keyed>
                {(server) => <MigrationStatus server={server} />}
              </Show>
            </Suspense>
          </AppInterface>
        </Show>
      </>
    )
  }

  return (
    <PlatformProvider value={platform}>
      <AppBaseProviders
        locale={selectStartupLocale(startup.state())}
        transparentRoot={hud}
        onNativeTranslations={(bundle) => void props.api.setNativeTranslations(bundle).catch(() => undefined)}
        onThemeApplied={(mode, scheme) => {
          // The HUD has no native titlebar or window controls to theme.
          if (!hud) void props.api.setTitlebar({ mode, scheme })
          startup.dispatch({ type: "theme.applied" })
        }}
      >
        <DesktopShell />
        <Show when={!hud && selectOverlayMounted(startup.state())}>
          <div
            data-component="startup-overlay"
            class="fixed inset-0 z-[100] transition-opacity duration-300 ease-out"
            classList={{ "pointer-events-none opacity-0": selectOverlayFading(startup.state()) }}
            onTransitionEnd={(event) => {
              if (event.target !== event.currentTarget) return
              startup.dispatch({ type: "overlay.transition-ended" })
            }}
          >
            <LoadingSplash
              firstLaunch={selectFirstLaunchSplash(startup.state())}
              deep={selectSplashDeep(startup.state())}
              platform={platform}
              drawingPaused={selectDrawingPaused(startup.state())}
              onDrawStart={() => startup.dispatch({ type: "drawing.started" })}
              onDrawEnd={() => startup.dispatch({ type: "drawing.ended" })}
            />
          </div>
        </Show>
      </AppBaseProviders>
    </PlatformProvider>
  )
}

/** Runs the window's startup machine for the owner's lifetime: its requests to main, its preloads and its timer. */
function createStartupDriver(input: {
  readonly api: ElectronAPI
  readonly platform: Platform
  readonly initialUrl: string
  readonly route: LayoutRoute
  readonly firstLaunch: boolean | undefined
}) {
  const initial = createStartupState({
    initialUrl: input.initialUrl,
    route: input.route,
    firstLaunch: input.firstLaunch,
    preview: import.meta.env.OPENCODE_TEST_ONBOARDING,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  })

  const [state, setState] = createSignal(initial.state)
  // The running phase timer; there is at most one.
  const timers = new Set<ReturnType<typeof setTimeout>>()
  // Events a transition's own state change raises (the app interface mounting) wait behind its effects.
  const queue: StartupEvent[] = []

  const drain = () => {
    const event = queue[0]

    if (!event) return

    const next = transitionStartup(untrack(state), event)

    setState(next.state)
    next.effects.forEach(run)
    queue.shift()
    drain()
  }

  const dispatch = (event: StartupEvent) => {
    queue.push(event)

    if (queue.length === 1) drain()
  }

  const run = (effect: StartupEffect) => {
    if (effect.type === "check-first-launch")
      return void input.api.isFirstLaunchOnboardingPending().then(
        (pending) => dispatch({ type: "first-launch.settled", pending }),
        (error) => {
          console.error("[desktop-onboarding] first launch check failed", error)
          dispatch({ type: "first-launch.settled", pending: false })
        },
      )

    // A failed locale preload falls back to English; the language provider still hydrates from the store.
    if (effect.type === "preload-locale")
      return void preloadStoredLocale(input.platform).then(
        (locale) => dispatch({ type: "locale.settled", locale }),
        () => dispatch({ type: "locale.settled", locale: undefined }),
      )

    if (effect.type === "await-sidecar")
      return void input.api.awaitInitialization().then(
        (data) => dispatch({ type: "sidecar.ready", data }),
        (error) => dispatch({ type: "startup.failed", error: localServerStartupError(error) }),
      )

    // A route that fails to preload loads again when it renders.
    if (effect.type === "preload-route")
      return void preloadRoute(effect.url).then(
        () => dispatch({ type: "route.preloaded" }),
        () => dispatch({ type: "route.preloaded" }),
      )

    if (effect.type === "notify-theme-ready") return void input.api.themeReady().catch(() => undefined)

    timers.forEach(clearTimeout)
    timers.clear()

    if (effect.type === "start-timer")
      timers.add(setTimeout(() => dispatch({ type: `${effect.timer}.timed-out` }), effect.timeoutMs))
  }

  onCleanup(input.api.onSidecarChanged((data) => dispatch({ type: "sidecar.changed", data })))
  onCleanup(() => dispatch({ type: "disposed" }))

  initial.effects.forEach(run)

  return { state, dispatch }
}

function DesktopStartupReady(props: { dispatch: (event: StartupEvent) => void; api: ElectronAPI }) {
  const tabs = useTabs()
  const route = useCurrentRoute()
  createEffect(() => {
    const value = route()
    props.dispatch({ type: "route.changed", route: value })
    // The global HUD shortcut lives in main and has no router; the focused window reports its
    // session so the shortcut can open the HUD on what the user is looking at.
    void props.api
      .hudReportSession(value.type === "session" ? sessionHref(value.server, value.sessionId) : undefined)
      .catch(() => undefined)
  })
  createEffect(() => {
    if (!tabs.ready() || !tabs.infoReady()) return
    props.dispatch({ type: "tabs.ready" })
  })

  return null
}

function DesktopEffects(props: { api: ElectronAPI; hud: boolean }) {
  const command = useCommand()
  // The HUD is not a full shell: its menu commands and theme background would act on the main
  // window's state, so it participates in neither.
  onCleanup(props.hud ? () => undefined : bindDesktopMenu((id) => command.trigger(id)))
  // Hand the caret back to the composer when the floating bar returns the session.
  onCleanup(
    props.hud
      ? () => undefined
      : props.api.onHudStateChanged((state) => {
          if (state.open) return
          queueMicrotask(() => command.trigger("input.focus"))
        }),
  )
  const theme = useTheme()

  createEffect(() => {
    if (props.hud) return
    theme.themeId()
    theme.mode()
    const background = getComputedStyle(document.documentElement).getPropertyValue("--background-base").trim()

    if (background) void props.api.setBackgroundColor(background)
  })

  return null
}
