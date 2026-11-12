export * as PluginLegacy from "./legacy.js"

// Blue Topaz fork: a compatibility bridge for V1 plugins.
//
// OpenCode V2 deliberately dropped the V1 plugin API: a V1 plugin returns one object of hooks, while
// V2 default-exports `{ id, setup(ctx) }` and registers through context domains. Upstream ships a
// migration guide instead of a shim, so plugins written for V1 fail to load with
// "Plugin must export a default definition with an id and an effect or setup function."
//
// This module detects the two V1 default-export shapes and adapts them onto the V2 domains, following
// the official mapping table (services/www/src/docs/content/build/plugins/migrate-v1.mdx):
//
//   event                                 -> ctx.event.subscribe()
//   tool map                              -> ctx.tool.transform(...)
//   tool.execute.before / after            -> ctx.tool.hook(...)
//   shell.env                             -> ctx.shell.hook("create.before", ...)
//   permission.ask                        -> ctx.permission.hook("evaluate", ...)
//   chat.params                           -> ctx.session.hook("context", ...)
//   experimental.chat.system.transform    -> ctx.session.hook("context", event.system)
//   experimental.chat.messages.transform  -> ctx.session.hook("context", event.messages)
//   experimental.session.compacting       -> ctx.session.hook("compaction", ...)
//   dispose                               -> cleanup returned by setup
//
// Everything is guarded: if a module is not a V1 plugin, or adaptation fails, this returns undefined
// and the caller keeps its normal "failed to load plugin" path. Hooks with no V2 equivalent (auth,
// config, provider, ...) are reported once and skipped rather than silently dropped.

import type { Context as PluginContext, Plugin as PromisePlugin } from "@opencode/plugin/promise/plugin"

type LegacyServer = (input: unknown, options: unknown) => unknown | Promise<unknown>

interface Candidate {
  readonly id?: string
  readonly server: LegacyServer
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function pluginIdFromSpec(spec: string): string {
  const version = spec.lastIndexOf("@")
  const name = version > 0 ? spec.slice(0, version) : spec
  return name.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]+/g, "-") || "legacy-plugin"
}

/** V1 modules default-export either `{ id, server }` or the plugin function itself. */
function candidates(mod: Record<string, unknown>): Candidate[] {
  const value = mod.default
  if (typeof value === "function") return [{ server: value as LegacyServer }]
  if (!isRecord(value)) return []
  if (typeof value.server === "function") {
    return [{ id: typeof value.id === "string" ? value.id : undefined, server: value.server as LegacyServer }]
  }
  return []
}

export function adapt(mod: Record<string, unknown>, spec: string): PromisePlugin | undefined {
  try {
    const found = candidates(mod)
    if (found.length === 0) return undefined
    const fallback = pluginIdFromSpec(spec)
    const ids = found.map((candidate, index) =>
      candidate.id && candidate.id.trim() ? candidate.id : found.length > 1 ? `${fallback}.${index}` : fallback,
    )

    return {
      id: ids[0],
      setup: async (ctx) => {
        const cleanups: Array<() => void> = []
        for (let index = 0; index < found.length; index++) {
          try {
            const hooks = await found[index].server(legacyInput(ctx), ctx.options)
            if (isRecord(hooks)) await register(hooks, ctx, cleanups, ids[index])
          } catch (error) {
            console.warn(`[plugin:${ids[index]}] V1 compatibility bridge failed to initialize`, error)
          }
        }
        return () => {
          for (const cleanup of cleanups) {
            try {
              cleanup()
            } catch {}
          }
        }
      },
    }
  } catch {
    return undefined
  }
}

/** No V2 hook exists for these V1 extension points; report them once so nothing fails silently. */
const UNSUPPORTED = new Set([
  "auth",
  "config",
  "provider",
  "command.execute.before",
  "experimental.compaction.autocontinue",
  "experimental.provider.small_model",
  "experimental.text.complete",
])

const BRIDGED = new Set([
  "tool",
  "tool.execute.before",
  "tool.execute.after",
  "event",
  "dispose",
  "shell.env",
  "permission.ask",
  "chat.params",
  "chat.message",
  "chat.headers",
  "experimental.chat.system.transform",
  "experimental.chat.messages.transform",
  "experimental.session.compacting",
])

function legacyInput(ctx: PluginContext) {
  const location = ctx.location as { directory?: string; project?: unknown }
  return {
    app: ctx.app,
    client: legacyClient(ctx),
    directory: location?.directory,
    project: location?.project,
    worktree: location?.directory,
    options: ctx.options,
  }
}

/**
 * V1 plugins receive the legacy SDK client (`{ body, path, query }` in, `{ data }` out). Only the
 * surface the ecosystem actually uses is reproduced, backed by the V2 session/agent/skill domains.
 */
function legacyClient(ctx: PluginContext) {
  const data = <A>(value: A) => Promise.resolve(value).then((result) => ({ data: result, error: undefined }))
  const body = (input: unknown) => (isRecord(input) && isRecord(input.body) ? input.body : {})
  const id = (input: unknown) => (isRecord(input) && isRecord(input.path) ? input.path.id : undefined)

  return {
    session: {
      create: (input: unknown) => data(ctx.session.create(body(input) as never)),
      prompt: (input: unknown) => data(ctx.session.prompt({ sessionID: id(input), ...body(input) } as never)),
      delete: (input: unknown) => data(ctx.session.remove({ sessionID: id(input) } as never)),
      list: () => data([]),
    },
    app: {
      agents: () => ctx.agent.list(),
      skills: () => ctx.skill.list(),
    },
    config: {
      get: () => data({}),
    },
  }
}

async function register(
  hooks: Record<string, unknown>,
  ctx: PluginContext,
  cleanups: Array<() => void>,
  id: string,
) {
  for (const name of Object.keys(hooks)) if (!BRIDGED.has(name) && !UNSUPPORTED.has(name)) UNSUPPORTED.add(name)
  for (const name of Object.keys(hooks)) {
    if (!UNSUPPORTED.has(name) || name === "tool") continue
    console.warn(`[plugin:${id}] V1 hook "${name}" has no V2 equivalent and is skipped`)
  }

  const tools = hooks.tool
  if (isRecord(tools)) {
    await ctx.tool.transform((editor) => {
      for (const [name, definition] of Object.entries(tools)) {
        if (!isRecord(definition) || typeof definition.execute !== "function") continue
        const execute = definition.execute as (input: unknown, context: unknown) => unknown
        editor.add({
          name,
          description: typeof definition.description === "string" ? definition.description : name,
          // V1 tool schemas are Zod objects, which satisfy StandardSchemaV1 - accepted as-is.
          input: definition.args as never,
          async execute(input, context) {
            const result = await execute(input, context)
            return { content: typeof result === "string" ? result : JSON.stringify(result) }
          },
        })
      }
    })
  }

  const trigger = (name: string) => (typeof hooks[name] === "function" ? (hooks[name] as Function) : undefined)

  const before = trigger("tool.execute.before")
  if (before) {
    await ctx.tool.hook("execute.before", async (event) => {
      try {
        const output: Record<string, unknown> = { args: event.input }
        await before({ ...event, callID: event.id }, output)
        event.input = output.args
      } catch (error) {
        console.warn(`[plugin:${id}] V1 "tool.execute.before" hook failed:`, error)
      }
    })
  }

  const after = trigger("tool.execute.after")
  if (after) {
    await ctx.tool.hook("execute.after", async (event) => {
      try {
        await after({ ...event, callID: event.id }, event.status === "completed" ? event.result : event.error)
      } catch (error) {
        console.warn(`[plugin:${id}] V1 "tool.execute.after" hook failed:`, error)
      }
    })
  }

  const onEvent = trigger("event")
  if (onEvent) {
    const controller = new AbortController()
    cleanups.push(() => controller.abort())
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          const value = event as { type?: string; properties?: unknown }
          await onEvent({ event: { type: value.type, properties: value.properties } })
        }
      } catch {}
    })()
  }

  const shellEnv = trigger("shell.env")
  if (shellEnv) {
    await ctx.shell.hook("create.before", async (event) => {
      try {
        const output: Record<string, unknown> = { env: event.env }
        await shellEnv({ cwd: event.cwd }, output)
        if (isRecord(output.env)) event.env = output.env as Record<string, string | undefined>
      } catch (error) {
        console.warn(`[plugin:${id}] V1 "shell.env" hook failed:`, error)
      }
    })
  }

  const ask = trigger("permission.ask")
  if (ask) {
    await ctx.permission.hook("evaluate", async (event) => {
      try {
        const output: Record<string, unknown> = {}
        await ask({ sessionID: event.sessionID, permission: event.action, patterns: event.resources }, output)
        if (typeof output.status === "string") event.effect = output.status as never
      } catch (error) {
        console.warn(`[plugin:${id}] V1 "permission.ask" hook failed:`, error)
      }
    })
  }

  // "chat.params" and the experimental transforms all land on the pre-request context hook.
  const params = trigger("chat.params")
  const systemTransform = trigger("experimental.chat.system.transform")
  const messagesTransform = trigger("experimental.chat.messages.transform")
  if (params || systemTransform || messagesTransform) {
    await ctx.session.hook("context", async (event) => {
      try {
        if (params) {
          const output = { ...event.options }
          await params({ sessionID: event.sessionID, agent: event.agent, model: event.model }, output)
          event.options = output as typeof event.options
        }
        if (systemTransform) {
          const output: Record<string, unknown> = { system: [...event.system] }
          await systemTransform({ sessionID: event.sessionID, agent: event.agent, model: event.model }, output)
          const parts = toSystemParts(output.system)
          if (parts) event.system = parts
        }
        if (messagesTransform) {
          const output: Record<string, unknown> = { messages: [...event.messages] }
          await messagesTransform({ sessionID: event.sessionID, agent: event.agent, model: event.model }, output)
          if (Array.isArray(output.messages)) event.messages = output.messages as typeof event.messages
        }
      } catch (error) {
        console.warn(`[plugin:${id}] V1 context hook failed:`, error)
      }
    })
  }

  const message = trigger("chat.message")
  if (message) {
    await ctx.session.hook("prompt", async (event) => {
      try {
        const parts = toLegacyParts(event.prompt)
        const output: Record<string, unknown> = { message: { id: event.messageID }, parts }
        await message({ sessionID: event.sessionID, messageID: event.messageID }, output)
        applyLegacyParts(output.parts, event.prompt)
      } catch (error) {
        console.warn(`[plugin:${id}] V1 "chat.message" hook failed:`, error)
      }
    })
  }

  const headers = trigger("chat.headers")
  if (headers) {
    await ctx.session.hook("model.request", async (event) => {
      try {
        const output: Record<string, unknown> = { headers: { ...event.headers } }
        await headers({ sessionID: event.sessionID, agent: event.agent, model: event.model }, output)
        if (isRecord(output.headers)) event.headers = output.headers as Record<string, string>
      } catch (error) {
        console.warn(`[plugin:${id}] V1 "chat.headers" hook failed:`, error)
      }
    })
  }

  const compacting = trigger("experimental.session.compacting")
  if (compacting) {
    await ctx.session.hook("compaction", async (event) => {
      try {
        const output: Record<string, unknown> = { context: event.messages }
        await compacting({ sessionID: event.sessionID, agent: event.agent, model: event.model }, output)
        if (Array.isArray(output.context)) event.messages = output.context as typeof event.messages
      } catch (error) {
        console.warn(`[plugin:${id}] V1 "experimental.session.compacting" hook failed:`, error)
      }
    })
  }

  const dispose = trigger("dispose")
  if (dispose) cleanups.push(() => void dispose())
}

/** V1 prompt messages carry an array of part objects; V2's prompt carries structured fields. */
function toLegacyParts(prompt: { text?: string; files?: unknown[] }): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = []
  if (typeof prompt.text === "string") {
    parts.push({ type: "text", text: prompt.text })
  }
  if (Array.isArray(prompt.files)) {
    for (const file of prompt.files) {
      if (isRecord(file)) {
        parts.push({ type: "file", ...file })
      }
    }
  }
  return parts
}

function applyLegacyParts(
  parts: unknown,
  prompt: { text: string; files?: unknown[] },
) {
  if (!Array.isArray(parts)) return
  const textParts: string[] = []
  const files: unknown[] = []
  for (const part of parts) {
    if (!isRecord(part)) continue
    if (part.type === "text" && typeof part.text === "string") {
      textParts.push(part.text)
    } else if (part.type === "file") {
      files.push(part)
    }
  }
  if (textParts.length > 0) {
    prompt.text = textParts.join("\n\n")
  }
  if (files.length > 0 || (Array.isArray(prompt.files) && prompt.files.length > 0)) {
    prompt.files = files as never
  }
}

/** V1 system transforms push plain strings; V2's system array holds parts. */
function toSystemParts(value: unknown) {
  if (!Array.isArray(value)) return undefined
  return value.map((entry) => (typeof entry === "string" ? { type: "text" as const, text: entry } : entry)) as never
}
