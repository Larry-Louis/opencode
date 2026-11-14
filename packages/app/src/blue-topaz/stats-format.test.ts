import { describe, expect, test } from "bun:test"
import { cacheHitRate, formatTokens, type SessionTokens } from "./stats-format"

const tokens = (input: number, read = 0, write = 0): SessionTokens => ({
  input,
  output: 0,
  reasoning: 0,
  cache: { read, write },
})

describe("session token stats", () => {
  test("abbreviates counts at thousands and millions", () => {
    expect(formatTokens(0)).toBe("0")
    expect(formatTokens(999)).toBe("999")
    expect(formatTokens(1_000)).toBe("1.0K")
    expect(formatTokens(12_345)).toBe("12.3K")
    expect(formatTokens(999_999)).toBe("1000.0K")
    expect(formatTokens(1_000_000)).toBe("1.0M")
    expect(formatTokens(4_560_000)).toBe("4.6M")
  })

  test("reads the cache hit share against reads, writes and fresh input", () => {
    expect(cacheHitRate(tokens(1_000, 9_000, 0))).toBe(90)
    expect(cacheHitRate(tokens(2_000, 5_000, 3_000))).toBe(50)
  })

  test("a session with no prompt yet reports no cache share instead of dividing by zero", () => {
    expect(cacheHitRate(tokens(0))).toBe(0)
  })
})
