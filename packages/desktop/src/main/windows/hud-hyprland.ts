import { connect } from "node:net"
import path from "node:path"
import { Option, Schema } from "effect"

/**
 * Hyprland tiles a new toplevel and owns `alwaysOnTop`, so the HUD has to be
 * floated and pinned through the compositor's IPC after it maps. Other
 * compositors have nothing to do here.
 */

export type HyprlandClient = {
  readonly address: string
  readonly floating: boolean
  readonly pinned: boolean
}

function socketPaths(env: NodeJS.ProcessEnv, uid: number) {
  const signature = env.HYPRLAND_INSTANCE_SIGNATURE

  if (!signature) return []

  const runtime = env.XDG_RUNTIME_DIR || `/run/user/${uid}`

  return [path.join(runtime, "hypr", signature, ".socket.sock"), path.join("/tmp/hypr", signature, ".socket.sock")]
}

function request(socketPath: string, command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = connect(socketPath)
    let data = ""
    let settled = false

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(500, () => finish(null))
    socket.on("error", () => finish(null))
    socket.on("data", (chunk) => (data += chunk.toString()))
    socket.on("end", () => finish(data))
    socket.on("connect", () => socket.write(command))
  })
}

const RawClient = Schema.Struct({
  title: Schema.optional(Schema.NullOr(Schema.String)),
  address: Schema.optional(Schema.NullOr(Schema.String)),
  floating: Schema.optional(Schema.Boolean),
  pinned: Schema.optional(Schema.Boolean),
})

const ClientsPayload = Schema.fromJsonString(Schema.Array(RawClient))

export function parseHudHyprlandClient(payload: string, title: string): HyprlandClient | null {
  const clients = Option.getOrUndefined(Schema.decodeUnknownOption(ClientsPayload)(payload))

  if (!clients) return null

  for (const client of clients) {
    const address = client.address ?? ""

    if (client.title !== title || !address) continue

    return {
      address: address.startsWith("0x") ? address : `0x${address}`,
      floating: client.floating === true,
      pinned: client.pinned === true,
    }
  }

  return null
}

function dispatchCommands(address: string, action: "float" | "pin") {
  const selector = `address:${address}`

  return action === "float"
    ? [
        `dispatch setfloating ${selector}`,
        `dispatch hl.dsp.window.float({ action = "enable", window = "${selector}" })`,
      ]
    : [`dispatch pin ${selector}`, `dispatch hl.dsp.window.pin({ action = "enable", window = "${selector}" })`]
}

async function dispatch(socketPath: string, commands: readonly string[]) {
  for (const command of commands) {
    const reply = await request(socketPath, command)

    if (reply == null) return false

    const text = reply.trim()

    if (text === "ok") return true

    if (!text.startsWith("Invalid dispatcher") && !text.startsWith("error:")) return false
  }

  return false
}

export async function promoteHudOnHyprland(options: {
  title: string
  env?: NodeJS.ProcessEnv
  uid?: number
  attempts?: number
  delayMs?: number
}): Promise<boolean> {
  const env = options.env ?? process.env
  const uid = options.uid ?? process.getuid?.() ?? 0
  const paths = socketPaths(env, uid)

  if (!paths.length) return false

  const attempts = options.attempts ?? 24
  const delay = options.delayMs ?? 100
  let socketPath: string | undefined
  let client: HyprlandClient | null = null

  for (let attempt = 0; attempt < attempts && !client; attempt++) {
    if (attempt > 0 && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))

    for (const candidate of paths) {
      const payload = await request(candidate, "j/clients")

      if (payload == null) continue

      socketPath = candidate
      client = parseHudHyprlandClient(payload, options.title)

      if (client) break
    }
  }

  if (!socketPath || !client) return false

  if (!client.floating && !(await dispatch(socketPath, dispatchCommands(client.address, "float")))) return false

  if (!client.pinned && !(await dispatch(socketPath, dispatchCommands(client.address, "pin")))) return false

  return true
}
