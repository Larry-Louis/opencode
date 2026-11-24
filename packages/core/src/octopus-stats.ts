export * as OctopusStats from "./octopus-stats.js"

import type { Entry } from "@opencode/schema/config"
import type { TokenUsage } from "@opencode/schema/token-usage"
import { Effect, Option } from "effect"
import { Config, latest } from "./config.js"
import { Provider } from "./provider.js"

const DEFAULT_URL = "http://127.0.0.1:8080"
const INGEST_PATH = "/api/v1/ingest/stats"

export type Report = {
  readonly providerID: string
  readonly modelID: string
  readonly tokens: TokenUsage.Info
  readonly cost: number
}

type Settings = {
  readonly url: string
  readonly apiKey: string
  readonly gateways: ReadonlySet<string>
  readonly excludeProviders: ReadonlySet<string>
}

type IngestRecord = {
  readonly id: string
  readonly timestamp: number
  readonly model: string
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_read_tokens: number
  readonly cache_write_tokens: number
  readonly cost: number
}

/**
 * Compares gateways by origin (scheme, host, port); loopback spellings are equivalent.
 * Paths never matter: every request to the gateway origin is counted by the gateway itself.
 */
function originKey(value: string): string | undefined {
  try {
    const url = new URL(value)
    const host =
      url.hostname === "localhost" || url.hostname === "[::1]" || url.hostname === "::1" ? "127.0.0.1" : url.hostname
    const port = url.port || (url.protocol === "https:" ? "443" : "80")
    return `${url.protocol}//${host}:${port}`
  } catch {
    return undefined
  }
}

function resolveSettings(entries: readonly Entry[]): Settings | undefined {
  const raw = latest(entries, "octopus")
  if (!raw || raw.enabled === false || !raw.api_key) return undefined
  const url = raw.url ?? DEFAULT_URL
  const gateways = new Set<string>()
  for (const value of [url, ...(raw.gateways ?? [])]) {
    const key = originKey(value)
    if (key) gateways.add(key)
  }
  return { url, apiKey: raw.api_key, gateways, excludeProviders: new Set(raw.exclude_providers ?? []) }
}

function providerBaseURL(provider: Provider.Info | undefined): string | undefined {
  const settings = provider?.settings
  if (!settings || typeof settings !== "object") return undefined
  const value = (settings as Record<string, unknown>).baseURL
  return typeof value === "string" ? value : undefined
}

/**
 * Reports one finished model step to the Octopus gateway unless the step went through a gateway origin.
 * Gateway traffic is counted by the gateway itself, so reporting it again would double count; the caller
 * invokes this for every completed step and the decision lives here.
 */
export const report = Effect.fn("OctopusStats.report")(function* (input: Report) {
  const config = yield* Effect.serviceOption(Config.Service)
  if (Option.isNone(config)) return
  const settings = resolveSettings(yield* config.value.entries())
  if (!settings || settings.excludeProviders.has(input.providerID)) return

  const providers = yield* Effect.serviceOption(Provider.Service)
  const provider = Option.isSome(providers)
    ? yield* providers.value.get(input.providerID as Provider.ID)
    : undefined
  const baseURL = providerBaseURL(provider)
  if (baseURL !== undefined) {
    const origin = originKey(baseURL)
    if (origin !== undefined && settings.gateways.has(origin)) return
  }

  const record: IngestRecord = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    model: input.modelID,
    // Octopus counts the full prompt as input tokens, cache hits and writes included.
    input_tokens: input.tokens.input + input.tokens.cache.read + input.tokens.cache.write,
    output_tokens: input.tokens.output + input.tokens.reasoning,
    cache_read_tokens: input.tokens.cache.read,
    cache_write_tokens: input.tokens.cache.write,
    cost: input.cost,
  }
  yield* deliver(settings, record).pipe(Effect.forkDetach)
})

/** Delivers one record with bounded retries; a report is best-effort and never fails the step. */
const deliver = (settings: Settings, record: IngestRecord) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 3; attempt++) {
      const delivered = yield* Effect.tryPromise({
        try: async () => {
          const response = await fetch(`${settings.url.replace(/\/+$/, "")}${INGEST_PATH}`, {
            method: "POST",
            headers: { authorization: `Bearer ${settings.apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({ source: "opencode", records: [record] }),
          })
          return response.ok
        },
        catch: (error) => error,
      }).pipe(Effect.catch(() => Effect.succeed(false)))
      if (delivered) return
      yield* Effect.sleep(`${500 * 2 ** attempt} millis`)
    }
    yield* Effect.logDebug("octopus usage report dropped", record)
  })
