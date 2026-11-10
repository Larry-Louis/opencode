// @refresh reload

import "./diagnostics"
import "./styles.css"
import { render } from "solid-js/web"
import { api } from "./api"
import { widgetHost } from "./blue-topaz-host"
import { BlueTopazWidgets } from "./blue-topaz-widgets"
import { DesktopApp } from "./desktop-app"
import { startDesktopMenu } from "./platform/menu"
import { startDeepLinks } from "./startup/deep-links"
import { requireRendererRoot } from "./startup/root"
import { desktopVersion, initializeSentry } from "./startup/sentry"

// Dev console noise filter — silence known harmless warnings (Solid root/ghostty/duplicate commands)
if (import.meta.env.DEV) {
  const shouldSuppress = (args: unknown[]) => {
    const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")
    return (
      text.includes("cleanups created outside a `createRoot`") ||
      text.includes("computations created outside a `createRoot`") ||
      text.includes("ghostty-vt") ||
      text.includes("ignoring CSI t") ||
      text.includes("unimplemented mode: 9001") ||
      text.includes("duplicate command id") ||
      text.includes("Electron Security Warning") ||
      text.includes("Slow network is detected") ||
      text.includes("Autofocus processing was blocked") ||
      text.includes("Blocked aria-hidden")
    )
  }
  const wrap =
    (fn: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (shouldSuppress(args)) return
      fn(...args)
    }
  console.warn = wrap(console.warn.bind(console)) as typeof console.warn
  console.error = wrap(console.error.bind(console)) as typeof console.error
  // ghostty also logs via console.log in some builds
  console.log = wrap(console.log.bind(console)) as typeof console.log
}

const root = requireRendererRoot()

const version = desktopVersion()

startDesktopMenu(api)

startDeepLinks(api)

render(() => <DesktopApp api={api} version={version} />, root)

void initializeSentry(version)

// Blue Topaz widgets：粘性用户请求徽章 + 序列条 + 会话状态栏 + 折叠思考按钮
// 这里先挂 documentElement（只为有个挂载点），组件挂载后由 ensureRootHost()
// 搬进 [data-slot="session-chat-panel"]，让 widgets 跟着聊天面板一起伸缩，
// 也保证它们不会跑到聊天区域之外（面板被 Solid 重渲染清掉时会自动补挂）。
// 宿主元素由 blue-topaz-host.ts 持有：面板把整棵子树丢掉后，同一元素的渲染结果还在，
// ensureRootHost() 直接重新挂回去即可（早先只在元素存在时才搬运，面板一清就永久消失）。
document.documentElement.appendChild(widgetHost)
render(() => <BlueTopazWidgets />, widgetHost)
