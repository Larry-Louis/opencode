/** The session's cumulative token usage, as the session info reports it. */
export type SessionTokens = {
  readonly input: number
  readonly output: number
  readonly reasoning: number
  readonly cache: { readonly read: number; readonly write: number }
}

/** A token count at a glance: 987, 12.3K, 4.5M. */
export function formatTokens(count: number) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`

  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`

  return String(count)
}

/**
 * The share of the prompt the provider served from cache: reads against reads, writes and fresh input.
 * A session that never saw a cacheable prompt reports 0 rather than an undefined share.
 */
export function cacheHitRate(tokens: SessionTokens) {
  const denominator = tokens.cache.read + tokens.cache.write + tokens.input

  return denominator > 0 ? Math.round((tokens.cache.read / denominator) * 100) : 0
}
