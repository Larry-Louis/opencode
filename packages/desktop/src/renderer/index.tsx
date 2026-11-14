// @refresh reload

import "./diagnostics"
import "./styles.css"
import { render } from "solid-js/web"
import { api } from "./api"
import { widgetHost } from "./blue-topaz-host"
import { BlueTopazThinking } from "./blue-topaz-widgets"
import { DesktopApp } from "./desktop-app"
import { startDesktopMenu } from "./platform/menu"
import { startDeepLinks } from "./startup/deep-links"
import { requireRendererRoot } from "./startup/root"
import { desktopVersion, initializeSentry } from "./startup/sentry"

// Dev console noise filter — silence known harmless warnings (Solid root/ghostty/duplicate commands)
if (import.meta.env.DEV) {
  const ignored = [
    "cleanups created outside a `createRoot`",
    "computations created outside a `createRoot`",
    "ghostty-vt",
    "ignoring CSI t",
    "unimplemented mode: 9001",
    "duplicate command id",
    "Electron Security Warning",
    "Slow network is detected",
    "Autofocus processing was blocked",
    "Blocked aria-hidden",
  ]

  const shouldSuppress = (args: unknown[]) => {
    const text = args.map((arg) => String(arg)).join(" ")

    return ignored.some((fragment) => text.includes(fragment))
  }

  const wrap =
    (write: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (shouldSuppress(args)) return

      write(...args)
    }

  // SAFETY: a console method takes any arguments and returns nothing, so the wrapper keeps its type.
  console.warn = wrap(console.warn.bind(console)) as typeof console.warn
  // SAFETY: same wrapper signature as above.
  console.error = wrap(console.error.bind(console)) as typeof console.error
  // ghostty also logs via console.log in some builds
  // SAFETY: same wrapper signature as above.
  console.log = wrap(console.log.bind(console)) as typeof console.log
}

const root = requireRendererRoot()

const version = desktopVersion()

const bootstrap = api.getWindowBootstrap()

// The HUD is a single-session surface: native menu commands and deep links belong to the full app
// window, and the fork's chat widgets expect the shell's chat panel.
if (bootstrap.kind !== "hud") {
  startDesktopMenu(api)

  startDeepLinks(api)
}

render(() => <DesktopApp api={api} version={version} />, root)

void initializeSentry(version)

// Blue Topaz：每轮末尾的「折叠思考」按钮
// 宿主先挂 documentElement（只为有个挂载点），组件挂载后由 ensureRootHost()
// 搬进 [data-slot="session-chat-panel"]，让按钮跟着聊天面板一起伸缩。
// 宿主元素由 blue-topaz-host.ts 持有：面板把整棵子树丢掉后，同一元素上的按钮还在，
// ensureRootHost() 直接重新挂回去即可。
if (bootstrap.kind !== "hud") {
  document.documentElement.appendChild(widgetHost)
  render(() => <BlueTopazThinking />, widgetHost)
}
