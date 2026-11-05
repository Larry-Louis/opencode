import { expect } from "bun:test"
import { Effect } from "effect"
import { LLM } from "../../src/index.js"
import { OpenAICompatibleChat } from "../../src/protocols/openai-compatible-chat.js"
import { AuthOptions } from "../../src/route/auth-options.js"
import { compileRequest } from "../../src/route/client.js"
import { it } from "../lib/effect.js"

// Reproduces the local-gateway case: a provider id the detector does not know
// (`octopus`) pointing at loopback, which fronts non-OpenAI backends such as
// Gemini's OpenAI-compatible endpoint.
const route = OpenAICompatibleChat.route.with({
  provider: "octopus",
  endpoint: { baseURL: "http://127.0.0.1:8080/v1" },
  auth: AuthOptions.bearer({ apiKey: "fixture" }, []),
})

const model = (compatibility?: Record<string, unknown>) =>
  route.model({ id: "gemini-3.5-flash-lite", provider: "octopus", compatibility })

it.effect("OpenAI-compatible chat without compatibility sends the OpenAI store default", () =>
  Effect.gen(function* () {
    const compiled = yield* compileRequest(LLM.request({ model: model(), prompt: "Hello", generation: { maxTokens: 200 } }))
    expect(compiled.body.store).toBe(false)
    expect(compiled.body.max_completion_tokens).toBe(200)
    expect(compiled.body.max_tokens).toBeUndefined()
  }),
)

it.effect("OpenAI-compatible chat omits store when compatibility disables it", () =>
  Effect.gen(function* () {
    const compiled = yield* compileRequest(
      LLM.request({ model: model({ supportsStore: false }), prompt: "Hello", generation: { maxTokens: 200 } }),
    )
    expect(compiled.body.store).toBeUndefined()
    expect(compiled.body.max_completion_tokens).toBe(200)
  }),
)

it.effect("OpenAI-compatible chat still honors an explicit provider option", () =>
  Effect.gen(function* () {
    const compiled = yield* compileRequest(
      LLM.request({ model: model(), prompt: "Hello", providerOptions: { store: true } }),
    )
    expect(compiled.body.store).toBe(true)
  }),
)
