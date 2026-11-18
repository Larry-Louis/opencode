import { describe, expect, test } from "bun:test"
import { Deferred, Effect, Result } from "effect"
import { OauthRedirect } from "../src/oauth/redirect"

const pasted = (text: string, state: string) => Effect.runSync(Effect.result(OauthRedirect.pasted(text, state)))

describe("OauthRedirect.pasted", () => {
  test("reads the authorization code and params from a matching callback URL", () => {
    const result = pasted("http://127.0.0.1:1455/callback?code=abc123&state=nonce-1", "nonce-1")

    expect(Result.isSuccess(result)).toBe(true)
    if (!Result.isSuccess(result) || !("code" in result.success)) throw new Error("expected an authorization code")
    expect(result.success.code).toBe("abc123")
    expect(result.success.params.get("state")).toBe("nonce-1")
  })

  test("trims surrounding whitespace from the pasted text", () => {
    const result = pasted("  https://example.com/cb?code=x&state=s  \n", "s")
    expect(Result.isSuccess(result)).toBe(true)
  })

  test("surfaces an error the provider put in a valid redirect", () => {
    const result = pasted("https://example.com/cb?error=access_denied&state=s", "s")

    expect(Result.isSuccess(result)).toBe(true)
    if (!Result.isSuccess(result) || !("error" in result.success)) throw new Error("expected a provider error")
    expect(result.success.error).toBe("access_denied")
    expect("code" in result.success).toBe(false)
  })

  test("prefers error_description over the error code", () => {
    const result = pasted("https://example.com/cb?error=access_denied&error_description=User%20denied&state=s", "s")

    expect(Result.isSuccess(result)).toBe(true)
    if (!Result.isSuccess(result) || !("error" in result.success)) throw new Error("expected a provider error")
    expect(result.success.error).toBe("User denied")
  })

  test("rejects text that is not a URL", () => {
    const result = pasted("not a url at all", "s")

    expect(Result.isFailure(result)).toBe(true)
    if (!Result.isFailure(result)) throw new Error("expected failure")
    expect(result.failure.message).toBe("Paste the full URL from the browser's address bar")
  })

  test("rejects a redirect from a different sign-in", () => {
    const result = pasted("https://example.com/cb?code=x&state=other", "expected")

    expect(Result.isFailure(result)).toBe(true)
    if (!Result.isFailure(result)) throw new Error("expected failure")
    expect(result.failure.message).toBe("This URL belongs to a different sign-in")
  })

  test("rejects a redirect that carries no code", () => {
    const result = pasted("https://example.com/cb?state=s", "s")

    expect(Result.isFailure(result)).toBe(true)
    if (!Result.isFailure(result)) throw new Error("expected failure")
    expect(result.failure.message).toBe("The URL does not contain an authorization code")
  })
})

describe("OauthRedirect.submit", () => {
  test("settles the pending callback with the received value", () => {
    const program = Effect.gen(function* () {
      const callback = yield* Deferred.make<string, Error>()
      yield* OauthRedirect.submit({
        state: "s",
        callback,
        received: (code, params) => `${code}:${params.get("scope") ?? ""}`,
      })("https://example.com/cb?code=c0de&state=s&scope=openid")
      return yield* Deferred.await(callback)
    })

    expect(Effect.runSync(program)).toBe("c0de:openid")
  })

  test("fails the callback when the redirect reports a provider error", () => {
    const program = Effect.gen(function* () {
      const callback = yield* Deferred.make<string, Error>()
      yield* OauthRedirect.submit({ state: "s", callback, received: (code) => code })(
        "https://example.com/cb?error=access_denied&state=s",
      )
      return { awaited: yield* Deferred.await(callback).pipe(Effect.result), done: yield* Deferred.isDone(callback) }
    })

    const result = Effect.runSync(program)
    expect(result.done).toBe(true)
    expect(Result.isFailure(result.awaited)).toBe(true)
    if (!Result.isFailure(result.awaited)) throw new Error("expected the callback to fail")
    expect(result.awaited.failure.message).toBe("access_denied")
  })

  test("leaves the callback pending when the pasted URL is invalid", () => {
    const program = Effect.gen(function* () {
      const callback = yield* Deferred.make<string, Error>()
      const settled = yield* OauthRedirect.submit({ state: "s", callback, received: (code) => code })("nonsense").pipe(
        Effect.result,
      )
      return { settled, done: yield* Deferred.isDone(callback) }
    })

    const result = Effect.runSync(program)
    expect(Result.isFailure(result.settled)).toBe(true)
    expect(result.done).toBe(false)
  })
})
