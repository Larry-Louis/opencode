import { net, session, type WebContents } from "electron"
import type { RpcClient } from "@opencode/client/effect/api"
import type { Session } from "@opencode/schema/session"
import { Browser } from "@opencode/plugin-browser/rpc"
import { BrowserProxy } from "@opencode/plugin-browser/proxy"
import { Effect } from "effect"
import { Base64 } from "effect/encoding"

export type BrowserNetwork = Effect.Success<ReturnType<typeof createBrowserNetwork>>

export const createBrowserNetwork = Effect.fn("BrowserNetwork.create")(function* (input: {
  rpc: RpcClient<typeof Browser.Definition, unknown>
  attachment: { sessionID: Session.ID; connectionID: string }
  location: { directory: string; workspace?: string }
  partition: string
  /** Whether the connected server runs on this machine, so its loopback is this loopback too. */
  sameMachine: boolean
}) {
  const options = { location: input.location }

  // A server on this machine shares this machine's network, so its browser follows the system
  // proxy (or the TUN) exactly like the app does, and no tunnel hop can lose a plain-HTTP body.
  // A server on another machine owns the network and the loopback, so its traffic keeps the
  // tunnel and the tunnel resolves both there.
  const proxy: Awaited<ReturnType<typeof BrowserProxy.make>> | undefined = input.sameMachine
    ? undefined
    : yield* Effect.acquireRelease(
        Effect.tryPromise(() =>
          BrowserProxy.make({
            open: (target, signal) =>
              Effect.runPromise(input.rpc["tunnel.open"]({ ...input.attachment, target }, options), { signal }),
            read: (tunnelID, signal) =>
              Effect.runPromise(input.rpc["tunnel.read"]({ ...input.attachment, tunnelID }, options), { signal }),
            write: (tunnelID, data, end, signal) =>
              Effect.runPromise(
                input.rpc["tunnel.write"]({ ...input.attachment, tunnelID, data: Base64.encode(data), end }, options),
                { signal },
              ),
            close: (tunnelID) =>
              Effect.runPromise(
                input.rpc["tunnel.close"]({ ...input.attachment, tunnelID }, options).pipe(Effect.timeout("5 seconds")),
              ),
          }),
        ),
        (proxy) => Effect.promise(() => proxy.close()),
      )

  const partition = session.fromPartition(input.partition)
  yield* Effect.addFinalizer(() => Effect.promise(() => partition.closeAllConnections()))
  // This is the browser's private partition, not the app/API connection. "system" reads the OS
  // proxy/PAC per request and keeps Chromium's implicit loopback bypass; the tunnel beside a
  // remote server has to borrow that server's loopback, so there the rules stay fixed.
  yield* Effect.tryPromise(() =>
    partition.setProxy(
      proxy
        ? { mode: "fixed_servers", proxyRules: proxy.url, proxyBypassRules: "<-loopback>" }
        : { mode: "system" },
    ),
  )
  yield* Effect.tryPromise(() => partition.closeAllConnections())

  return {
    attach(contents: WebContents) {
      const login = (
        event: Electron.Event,
        _details: Electron.AuthenticationResponseDetails,
        auth: Electron.AuthInfo,
        callback: (username?: string, password?: string) => void,
      ) => {
        if (
          !proxy ||
          !auth.isProxy ||
          auth.scheme !== "basic" ||
          auth.host !== proxy.host ||
          auth.port !== proxy.port ||
          auth.realm !== "OpenCode Browser Proxy"
        )
          return
        event.preventDefault()
        callback(proxy.credentials.username, proxy.credentials.password)
      }

      contents.on("login", login)
      contents.setWebRTCIPHandlingPolicy("disable_non_proxied_udp")

      return () => contents.off("login", login)
    },
    /**
     * Fetches a page icon through the server's network, as the page loaded it. Resolves undefined for anything but a
     * small image: a failure, a timeout, another content type, or more than `MAX_ICON_BYTES`.
     */
    icon: (url: string) =>
      new Promise<{ mime: string; data: Buffer } | undefined>((resolve) => {
        const request = net.request({ url, session: partition, useSessionCookies: true, redirect: "follow" })
        const chunks: Buffer[] = []

        const finish = (value?: { mime: string; data: Buffer }) => {
          clearTimeout(timeout)
          resolve(value)
        }

        const fail = () => {
          request.abort()
          finish()
        }

        const timeout = setTimeout(fail, 5_000)
        request.on("login", (auth, callback) => {
          if (proxy && auth.isProxy && auth.host === proxy.host && auth.port === proxy.port)
            return callback(proxy.credentials.username, proxy.credentials.password)
          callback()
        })
        request.on("response", (response) => {
          const header = response.headers["content-type"]
          const mime = (Array.isArray(header) ? header[0] : header)?.split(";")[0]?.trim().toLowerCase() ?? ""

          if (response.statusCode !== 200 || !mime.startsWith("image/")) return fail()
          response.on("data", (chunk) => {
            chunks.push(chunk)

            if (chunks.reduce((size, item) => size + item.length, 0) > MAX_ICON_BYTES) fail()
          })
          response.on("end", () => finish({ mime, data: Buffer.concat(chunks) }))
          response.on("error", fail)
        })
        request.on("error", fail)
        request.end()
      }),
  }
})

/** Icons larger than this are not worth reducing; sites list a favicon of a few kilobytes. */
const MAX_ICON_BYTES = 256 * 1024
